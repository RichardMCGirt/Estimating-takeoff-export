from flask import Flask, request, jsonify, send_file
import xlwings as xw
import os
import datetime
import shutil
from flask_cors import CORS

app = Flask(__name__, static_url_path='/static', static_folder='static')
CORS(app, supports_credentials=True, origins=[
    "http://127.0.0.1:5500",
    "https://estimatingtool.vanirinstalledsales.info"
])

@app.route('/inject', methods=['POST'])
def inject():
    try:
        data = request.get_json()
        print("🔍 Received data:", data)

        if not data:
            return jsonify({'error': 'No data received'}), 400

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"

        # Save to a temporary directory instead of Downloads
        temp_dir = os.path.join(os.getcwd(), "temp_outputs")
        os.makedirs(temp_dir, exist_ok=True)
        output_path = os.path.join(temp_dir, output_filename)

        shutil.copy("plan.xlsb", output_path)

        # Open Excel silently
        app_xl = xw.App(visible=False, add_book=False)
        wb = app_xl.books.open(output_path)
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

        labor_skus = set(labor_map.values())
        non_labor_data = [row for row in data if row.get("SKU", "").strip().lower() not in labor_skus]

        for i, row in enumerate(non_labor_data, start=8):
            sheet.range(f"A{i}").value = row.get("SKU", "")
            sheet.range(f"B{i}").value = row.get("Description", "")
            sheet.range(f"C{i}").value = row.get("Description2", "")
            sheet.range(f"D{i}").value = row.get("UOM", "")
            sheet.range(f"E{i}").value = row.get("TotalQty", 0)
            sheet.range(f"F{i}").value = row.get("ColorGroup", "")
            sheet.range(f"G{i}").value = row.get("Vendor", "")

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

        wb.save(output_path)
        wb.close()
        app_xl.quit()

        # ✅ Return file to browser
        return send_file(output_path, as_attachment=True, download_name=output_filename)

    except Exception as e:
        print("❌ Error in /inject:", str(e))
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
