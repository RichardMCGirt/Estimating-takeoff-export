from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import xlwings as xw
import os
import datetime
import shutil
import math
import threading
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
        import json
        print("🔍 Full payload:\n", json.dumps(payload, indent=2))

        if not payload or 'data' not in payload or 'type' not in payload:
            return jsonify({'error': 'Invalid payload'}), 400

        data = payload['data']
        breakout_data = payload.get('breakout', [])
        raw_data = payload.get('raw', [])
        labor_rates = payload.get('laborRates', {})
        data_type = payload['type']
        metadata = payload.get("metadata", {})

        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_filename = f"Vanir_Takeoff_{timestamp}.xlsb"
        downloads_path = os.path.join(os.path.expanduser("~"), "Downloads")
        output_path = os.path.join(downloads_path, output_filename)

        shutil.copy("plan.xlsb", output_path)

        app_xl = xw.App(visible=False, add_book=False)
        wb = app_xl.books.open(output_path)

        if data_type in ["elevation", "combined"]:
            print("📄 Injecting Elevation Sheet")
            sheet = wb.sheets["TakeOff Template"]

            raw_folder = data[0].get("Folder") or metadata.get("elevation", "")
            folder_name = (raw_folder or "").strip().lower()
            elevation_value = (metadata.get("elevation", "") or folder_name).strip().title()

            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,
                metadata.get("materialType", ""),
                metadata.get("date", ""),
                metadata.get("estimator", "")
            ]

            for row_index, value in enumerate(metadata_values, start=15):
                start_col = 12  # Column L
                end_col = 15    # Column O
                cell_range = sheet.range((row_index, start_col), (row_index, end_col))
                if cell_range.api.MergeCells:
                    cell_range.api.UnMerge()
                cell_range[0, 0].value = value
                cell_range.api.Merge()
                cell_range.api.HorizontalAlignment = -4108
                cell_range.api.VerticalAlignment = -4108

            # Clear non-labor ranges
            sheet.range("A8:A100").clear_contents()
            sheet.range("C8:C100").clear_contents()
            sheet.range("E8:E100").clear_contents()
            sheet.range("F8:F100").clear_contents()

            non_labor_data, _ = split_labor(data)
            non_labor_data = sort_by_description(non_labor_data)

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

            # Paint labor
            paint_labor_raw = str(metadata.get("paintlabor") or "").strip()
            paint_labor_cleaned = re.sub(r'[^\d.\-]', '', paint_labor_raw)

            if paint_labor_cleaned:
                try:
                    sheet.range("L48").value = float(paint_labor_cleaned)
                    print(f"🖌️ Paint Labor injected into L48: {paint_labor_cleaned}")
                except ValueError:
                    print(f"⚠️ Invalid paint labor value after cleanup: {paint_labor_cleaned}")
            else:
                print("ℹ️ No paint labor value provided.")

            # Inject labor
            try:
                labor_start_row = 34
                labor_end_row = 52
                current_row = labor_start_row

                labor_keys_seen = set()
                combined_labor_keys = set()

                labor_items_from_data = {
                    (item.get("SKU") or "").strip().upper(): item
                    for item in data
                    if "ZLABOR" in (item.get("SKU") or "").upper()
                }

                for sku in labor_items_from_data.keys():
                    combined_labor_keys.add(sku.replace("ZLABOR", "").lower())
                for key in labor_rates.keys():
                    combined_labor_keys.add(key.replace("Labor", "").lower())

                for key in sorted(combined_labor_keys):
                    if current_row > labor_end_row:
                        print("⚠️ Reached max labor row limit.")
                        break

                    label = key.title().replace("Tng", "T&G") + " Labor"
                    sku = "zLABOR" + key.upper()
                    qty_raw = labor_items_from_data.get(sku.upper(), {}).get("TotalQty")
                    try:
                        qty = float(qty_raw) if qty_raw not in [None, ""] else 0

                    except ValueError:
                        qty = ""

                    rate_key = key + "Labor"
                    rate = labor_rates.get(rate_key, "")

                    sheet.range(f"K{current_row}").value = sku
                    sheet.range(f"A{current_row}").value = ""
                    sheet.range(f"L{current_row}").value = qty
                    sheet.range(f"N{current_row}").value = rate

                    print(f"✅ Injected: Row {current_row} | {label} | SKU={sku} | Qty={qty} | Rate={rate}")
                    current_row += 1

            except Exception as e:
                print(f"❌ Error injecting labor: {e}")
                return jsonify({'error': str(e)}), 500

        wb.save()
        wb.close()
        app_xl.quit()
        return send_file(output_path, as_attachment=True)

    except Exception as e:
        print(f"❌ Server error: {e}")
        return jsonify({'error': str(e)}), 500

    finally:
        injection_lock.release()



if __name__ == "__main__":
    from waitress import serve
    print("Starting server with Waitress on port 5000...")
    serve(app, host="0.0.0.0", port=5000)