from flask import Flask, request, jsonify
import xlwings as xw
import os
import datetime
import shutil
import subprocess

app = Flask(__name__)

@app.route('/inject', methods=['POST'])
def inject():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data received'}), 400

        # Create timestamped output path
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"
        downloads_path = os.path.join(os.getcwd(), "downloads")
        os.makedirs(downloads_path, exist_ok=True)
        output_path = os.path.join(downloads_path, output_filename)

        # Copy template
        template = "plan.xlsb"
        shutil.copy(template, output_path)

        wb = xw.Book(output_path)
        sheet = wb.sheets["TakeOff Template"]

        # Define labor SKU map
        labor_map = {
            "lap labor": "zLABORLAP",
            "b&b labor": "zLABORBB",
            "shake labor": "zLABORSHAKE",
            "ceiling labor": "zLABORCEIL",
            "column labor": "zLABORSTCOL",
            "shutter labor": "zLABORSHUT",
            "louver labor": "zLABORLOUV",
            "bracket labor": "zLABORBRKT",
            "beam wrap labor": "zLABORBEAM",
            "t&g ceiling labor": "zLABORTGCEIL"
        }

        labor_skus = set(labor_map.values())
        non_labor_data = [row for row in data if row.get("SKU", "").strip().lower() not in labor_skus]

        # Inject A:G
        for i, row in enumerate(non_labor_data, start=8):
            sheet.range(f"A{i}").value = row.get("SKU", "")
            sheet.range(f"B{i}").value = row.get("Description", "")
            sheet.range(f"C{i}").value = row.get("Description2", "")
            sheet.range(f"D{i}").value = row.get("UOM", "")
            sheet.range(f"E{i}").value = row.get("TotalQty", 0)
            sheet.range(f"F{i}").value = row.get("ColorGroup", "")
            sheet.range(f"G{i}").value = row.get("Vendor", "")

        # Inject L34–L43 based on labor SKUs
        for row in range(34, 44):
            raw_val = sheet.range(f"K{row}").value
            if not raw_val:
                continue

            labor_desc = str(raw_val).strip().lower()
            sku = labor_map.get(labor_desc)

            qty = ""
            if sku:
                qty_item = next((item for item in data if item.get("SKU", "").strip().lower() == sku.lower()), None)
                if qty_item:
                    qty = qty_item.get("TotalQty", 0)
            else:
                matching_item = next((item for item in data if labor_desc in str(item.get("Description", "")).strip().lower()), None)
                if matching_item:
                    qty = matching_item.get("TotalQty", 0)

            sheet.range(f"L{row}").value = qty

        # Save and open
        wb.save(output_path)
        wb.close()
        wb.app.quit()

        subprocess.Popen(["start", "excel", output_path], shell=True)
        return jsonify({'status': 'success', 'path': output_path})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
