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

def sort_by_description(data, key="Description"):
    return sorted(data, key=lambda x: (x.get(key) == "", (x.get(key) or "").lower()))


def split_labor(data):
    return (
        [row for row in data if "labor" not in row.get("SKU", "").lower()],
        [row for row in data if "labor" in row.get("SKU", "").lower()]
    )


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

             # === Inject metadata into LMNO15–20 ===
            metadata = payload.get("metadata", {})
            folder_name = data[0].get("Folder", "").strip().lower() or metadata.get("elevation", "").strip().lower()
            elevation_value = (metadata.get("elevation", "") or folder_name).strip().title()




            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,  # ✅ Now guaranteed to fall back
                metadata.get("materialType", ""),
                metadata.get("date", ""),
                metadata.get("estimator", "")
            ]

            print("📌 Injecting metadata into TakeOff Template:", metadata_values)  


            # LMNO columns (L=12, M=13, N=14, O=15)
        for row_index, value in enumerate(metadata_values, start=15):
            start_col = 12  # Column L
            end_col = 15    # Column M

            # Unmerge if merged
            cell_range = sheet.range((row_index, start_col), (row_index, end_col))
            if cell_range.api.MergeCells:
                cell_range.api.UnMerge()
            print(f"✅ Merged range at row {row_index}: {cell_range.address}")

    # Write value into starting cell
            cell_range[0, 0].value = value

    # Re-merge the range
            cell_range.api.Merge()

            cell_range.api.HorizontalAlignment = -4108  # xlCenter
            cell_range.api.VerticalAlignment = -4108    # xlCenter

            # ✅ Inject Paint Labor value into cell L48
        paint_labor = metadata.get("paintlabor", "").strip()
        if paint_labor:
            try:
                sheet.range("L48").value = float(paint_labor)
                print(f"🖌️ Paint Labor injected into L48: {paint_labor}")
            except ValueError:
                print(f"⚠️ Invalid paint labor value: {paint_labor}")

        # ⬇️ Always run this regardless of paint labor
        non_labor_data, labor_data = split_labor(data)
        non_labor_data = sorted(non_labor_data, key=lambda x: (x.get("Description") == "", (x.get("Description") or "").lower()))
        print("🔠 Sorted Elevation Description values:")

        for i, row in enumerate(non_labor_data, start=8):
            sheet.range(f"A{i}").value = row.get("SKU", "")
            sheet.range(f"C{i}").value = row.get("Description2", "")
            sheet.range(f"E{i}").value = math.ceil(row.get("TotalQty", 0))
            sheet.range(f"F{i}").value = row.get("ColorGroup", "")
            
            
            labor_map = {
                "lap labor": "zLABORLAP",
                "B&B Labor": "zLABORBB",
                "Shake Labor": "zLABORSHAK",
                "ceiling labor": "zLABORCEIL",
                "column labor": "zLABORSTCOL",
                "shutter labor": "zLABORSHUT",
                "louver labor": "zLABORLOUV",
                "bracket labor": "zLABORBRKT",
                "beam wrap labor": "zLABORBEAM",
                "t&g ceiling labor": "zLABORTGCEIL"
            }

            non_labor_data, labor_data = split_labor(data)
            non_labor_data = sorted(non_labor_data, key=lambda x: (x.get("Description") == "", (x.get("Description") or "").lower()))
            print("🔠 Sorted Elevation Description values:")

            for i, row in enumerate(non_labor_data, start=8):
                sheet.range(f"A{i}").value = row.get("SKU", "")
                sheet.range(f"C{i}").value = row.get("Description2", "")
                sheet.range(f"E{i}").value = math.ceil(row.get("TotalQty", 0))
                sheet.range(f"F{i}").value = row.get("ColorGroup", "")

            folder_name = (data[0].get("Folder", "") or metadata.get("elevation", "")).strip().lower()




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

            sorted_breakout = sort_by_description(breakout_data, key="Description")
            print("🔠 Sorted Description values:")

            for item in sorted_breakout:

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
