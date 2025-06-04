from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import xlwings as xw
import os
import datetime
import shutil
import math
import threading
injection_lock = threading.Lock()

app = Flask(__name__)
CORS(app, origins="*", methods=["POST", "OPTIONS"], allow_headers="*")

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

@app.route('/inject', methods=['POST', 'OPTIONS'])
def inject():
    if request.method == 'OPTIONS':
        return '', 204
  # 🔐 Attempt to acquire lock
    if not injection_lock.acquire(blocking=False):
        return jsonify({'error': 'Another injection is currently running. Please wait.'}), 429
        
    try:
        payload = request.get_json()
        print("🔍 Received payload:", payload)

        if not payload or 'data' not in payload or 'type' not in payload:
            return jsonify({'error': 'Invalid payload'}), 400

        data = payload['data']
        breakout_data = payload.get('breakout', [])
        raw_data = payload.get('raw', [])
        data_type = payload['type']

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"
        downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
        output_path = os.path.join(downloads_path, output_filename)

        shutil.copy("plan.xlsb", output_path)

        app_xl = xw.App(visible=False, add_book=False)
        wb = app_xl.books.open(output_path)

        # === Elevation Sheet Injection ===
        if data_type in ["elevation", "combined"]:
            print("📄 Injecting Elevation Sheet")
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

            non_labor_data = [row for row in data if "labor" not in row.get("SKU", "").strip().lower()]
            for i, row in enumerate(non_labor_data, start=8):
                sheet.range(f"A{i}").value = row.get("SKU", "")
                sheet.range(f"C{i}").value = row.get("Description2", "")
                sheet.range(f"E{i}").value = math.ceil(row.get("TotalQty", 0))
                sheet.range(f"F{i}").value = row.get("ColorGroup", "")

            folder_name = data[0].get("Folder", "").strip().lower() if data else ""


            for row_index in range(34, 44):  # ✅ MUST be row_index

                raw_val = sheet.range(f"K{row_index}").value

                if not raw_val:
                    continue

                labor_desc = str(raw_val).strip().lower()
                sku = labor_map.get(labor_desc)
                qty = 0
                if sku:
                    matching_item = next(
                        (item for item in data
                        if item.get("SKU", "").strip().lower() == sku.lower()
                        and item.get("Folder", "").strip().lower() == folder_name),
                        None
                    )
                    if matching_item:
                        qty = matching_item.get("TotalQty", 0)

                sheet.range(f"L{row_index}").value = qty



        # === Material Breakout Sheet Injection ===
        if data_type == "combined" or data_type.startswith("material_breakout"):
            print("📄 Injecting Material Break Out Sheet")
            material_sheet = wb.sheets["Material Break Out"]
            material_sheet.range("A9:Z1000").clear_contents()
            current_row = 9

            for item in breakout_data:
                print(f"Injecting Row {current_row}: SKU={item.get('SKU')}, Desc2={item.get('Description2')}")
                material_sheet.range(f"A{current_row}").value = item.get("SKU", "")
                material_sheet.range(f"B{current_row}").value = item.get("Description", "")
                material_sheet.range(f"C{current_row}").value = item.get("Description2", "")
                material_sheet.range(f"D{current_row}").value = item.get("UOM", "")
                material_sheet.range(f"E{current_row}").value = item.get("TotalQty", 0)
                material_sheet.range(f"F{current_row}").value = item.get("ColorGroup", "")
                current_row += 1

          
        try:
            wb.save(output_path)
        finally:
            wb.close()
            app_xl.quit()

        return send_file(
            output_path,
            as_attachment=True,
            download_name=output_filename,
            mimetype='application/vnd.ms-excel.sheet.binary.macroEnabled.12'
        )

    except Exception as e:
        print("❌ Error in /inject:", str(e))
        return jsonify({'error': str(e)}), 500
    finally:
        injection_lock.release()

if __name__ == '__main__':
    app.run(port=5000)
