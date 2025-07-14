from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import xlwings as xw
import os
import datetime
import shutil
import math
import threading
import sys
import re

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

@app.route("/health")
def health():
    return "Healthy!"

@app.route('/inject', methods=['POST', 'OPTIONS'])
def inject():
    if request.method == 'OPTIONS':
        response = app.make_response('')
        response.status_code = 204
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    if not injection_lock.acquire(blocking=False):
        return jsonify({'error': 'Another injection is currently running. Please wait.'}), 429
        
    try:
        payload = request.get_json()

        if not payload or 'data' not in payload or 'type' not in payload:
            return jsonify({'error': 'Invalid payload'}), 400

        data = payload['data']
        breakout_data = payload.get('breakout', [])
        data_type = payload['type']

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"
        downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
        output_path = os.path.join(downloads_path, output_filename)
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))

        source_xlsb = os.path.join(BASE_DIR, "plan.xlsb")
        shutil.copy(source_xlsb, output_path)

        app_xl = xw.App(visible=False, add_book=False)
        wb = app_xl.books.open(output_path)

        if data_type in ["elevation", "combined"]:
            sheet = wb.sheets["TakeOff Template"]

            metadata = payload.get("metadata", {})
            raw_folder = data[0].get("Folder") or metadata.get("elevation", "")
            folder_name = (raw_folder or "").strip().lower()
            elevation_value = (metadata.get("elevation", "") or folder_name).strip().title()

            labor_map = {
                "lap labor": "zLABORLAP",
                "b&b labor": "zLABORBB",
                "shake labor": "zLABORSHAK",
                "ceiling labor": "zLABORCEIL",
                "column labor": "zLABORCOL",
                "shutter labor": "zLABORSHUT",
                "louver labor": "zLABORLOUV",
                "bracket labor": "zLABORBKTS",
                "beam wrap labor": "zLABORBEAM",
                "t&g ceiling labor": "zLABORCEILTNG"
            }

            labor_rates = payload.get("laborRates", {})
            frontend_labor_keys = {
                "lap labor": "lapLabor",
                "b&b labor": "bbLabor",
                "shake labor": "shakeLabor",
                "ceiling labor": "ceilingLabor",
                "column labor": "columnLabor",
                "shutter labor": "shutterLabor",
                "louver labor": "louverLabor",
                "bracket labor": "bracketLabor",
                "beam wrap labor": "beamWrapLabor",
                "t&g ceiling labor": "tngCeilingLabor",
                "paint labor": "paintLabor", 
                "other labor": "otherLabor"
            }

            predefined_sku_map = set(labor_map.values())

            custom_labor_start_row = 48
            max_labor_row = 52
            row_pointer = custom_labor_start_row

            while row_pointer <= max_labor_row:
                k_val = sheet.range(f"K{row_pointer}").value
                if not k_val or str(k_val).strip().lower() == "other labor":
                    break
                row_pointer += 1

            if row_pointer > max_labor_row:
                return jsonify({'error': 'No space left in the sheet for custom labor'}), 500

            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,
                metadata.get("materialType", ""),
                metadata.get("date", ""),
                metadata.get("estimator", "")
            ]

            # Inject metadata into merged cells L15:O20
            for row_index, value in enumerate(metadata_values, start=15):
                start_col = 12  # L
                end_col = 15    # O

                cell_range = sheet.range((row_index, start_col), (row_index, end_col))
                if cell_range.api.MergeCells:
                    cell_range.api.UnMerge()

                cell_range[0, 0].value = value
                cell_range.api.Merge()
                cell_range.api.HorizontalAlignment = -4108  # center
                cell_range.api.VerticalAlignment = -4108    # center

            # Clear ranges for injection
            sheet.range("A8:A100").clear_contents()
            sheet.range("C8:C100").clear_contents()
            sheet.range("E8:E100").clear_contents()
            sheet.range("F8:F100").clear_contents()

            non_labor_data, _ = split_labor(data)
            non_labor_data = sorted(non_labor_data, key=lambda x: (x.get("Description") == "", (x.get("Description") or "").lower()))

            for i, row in enumerate(non_labor_data, start=8):
                sku = row.get("SKU", "")
                desc2 = row.get("Description2", "")
                qty_raw = row.get("TotalQty", 0)
                color_group = row.get("ColorGroup", "")
                uom = (row.get("UOM") or "").strip().upper()

                is_labor = "labor" in sku.lower()
                skip_rounding = is_labor or uom == "SQ"
                total_qty = qty_raw if skip_rounding else math.ceil(abs(qty_raw))

                sheet.range(f"A{i}").value = sku
                sheet.range(f"C{i}").value = desc2
                sheet.range(f"E{i}").value = total_qty
                sheet.range(f"F{i}").value = color_group

            for row_index in range(34, 44):  # N34 to N43
                k_cell = sheet.range(f"K{row_index}")
                n_cell = sheet.range(f"N{row_index}")

                raw_label = k_cell.value
                if not raw_label:
                    continue

                label = str(raw_label).strip().lower()
                mapped_key = frontend_labor_keys.get(label)

                if mapped_key:
                    raw_value = labor_rates.get(mapped_key)
                    if raw_value not in (None, ""):
                        try:
                            n_cell.value = float(raw_value)
                            sku = labor_map.get(label, "").strip()
                            matching_item = next(
                                (item for item in data if item.get("SKU", "").strip().upper() == sku.upper()),
                                None
                            )
                            qty = matching_item.get("TotalQty", 0) if matching_item else 0
                            sheet.range(f"L{row_index}").value = qty
                        except ValueError:
                            print(f"Invalid float for labor rate: {raw_value}")
                    else:
                        print(f"No labor rate for '{mapped_key}', skipping injection")
                else:
                    print(f"Label '{label}' in K{row_index} not in frontend mapping")

            paint_labor_raw = str(metadata.get("paintlabor") or "").strip()
            paint_labor_cleaned = re.sub(r'[^\d.\-]', '', paint_labor_raw)

            if paint_labor_cleaned:
                try:
                    sheet.range("L48").value = float(paint_labor_cleaned)
                except ValueError:
                    print(f"Invalid paint labor value: {paint_labor_cleaned}")

        # Material breakout injection (similar pattern)...

        # Save and cleanup
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
        return jsonify({'error': str(e)}), 500
    finally:
        injection_lock.release()

@app.route("/")
def home():
    return "Your server is running and responding!"

if __name__ == "__main__":
    from waitress import serve
    print("Getting ready to run Waitress...")
    serve(app, host="0.0.0.0", port=5000)
