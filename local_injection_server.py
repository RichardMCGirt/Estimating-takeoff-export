from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import xlwings as xw
import os
import datetime
import shutil
from collections import defaultdict

app = Flask(__name__)
CORS(app, origins="*", methods=["POST", "OPTIONS"], allow_headers="*")


@app.route('/inject', methods=['POST', 'OPTIONS'])
def inject():
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.get_json()
        print("🔍 Received data:", data)

        if not data:
            return jsonify({'error': 'No data received'}), 400
        original_data = list(data)

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"
        downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
        output_path = os.path.join(downloads_path, output_filename)

        shutil.copy("plan.xlsb", output_path)

        app_xl = xw.App(visible=False, add_book=False)
        wb = app_xl.books.open(output_path)

        # === 1. Fill "TakeOff Template" ===
        sheet = wb.sheets["TakeOff Template"]

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

        labor_skus = set(sku.lower() for sku in labor_map.values())
        non_labor_data = [
            row for row in data
            if "labor" not in row.get("SKU", "").strip().lower()
        ]


        for i, row in enumerate(non_labor_data, start=8):
            sheet.range(f"A{i}").value = row.get("SKU", "")
            sheet.range(f"C{i}").value = row.get("Description2", "")  
            sheet.range(f"E{i}").value = row.get("TotalQty", 0)
            sheet.range(f"F{i}").value = row.get("ColorGroup", "")

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

        # === 2. Fill "Material Break Out" ===
        material_sheet = wb.sheets["Material Break Out"]
        material_sheet.range("A9:Z1000").clear_contents()

        # Filter out SKUs that contain "labor"
        material_data = [row for row in original_data if "labor" not in row.get("SKU", "").lower()]

        # Group by Folder
        grouped_by_folder = defaultdict(list)
        for row in material_data:
            folder = row.get("Folder", "Uncategorized")
            grouped_by_folder[folder].append(row)

        current_row = 9
        for folder, items in grouped_by_folder.items():
            for item in items:
                # 🔍 Add this debug log here
                print(f"Injecting Row {current_row}:")
                print("  SKU:", item.get("SKU"))
                print("  Description:", item.get("Description"))
                print("  Description2:", item.get("Description2"))
                print("  Units:", item.get("Units"))
                material_sheet.range(f"A{current_row}").value = item.get("SKU", "")
                material_sheet.range(f"B{current_row}").value = item.get("Description", "")
                material_sheet.range(f"C{current_row}").value = item.get("Description2", "")
                material_sheet.range(f"D{current_row}").value = item.get("UOM", "")
                material_sheet.range(f"E{current_row}").value = item.get("TotalQty", 0)
                material_sheet.range(f"F{current_row}").value = item.get("ColorGroup", "")
                current_row += 1


        wb.save(output_path)
        wb.close()
        app_xl.quit()

        return send_file(output_path, as_attachment=True, download_name=output_filename)

    except Exception as e:
        print("❌ Error in /inject:", str(e))
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
