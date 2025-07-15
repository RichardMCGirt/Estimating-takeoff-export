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

    # Try to acquire the lock without blocking
    if not injection_lock.acquire(blocking=False):
        return jsonify({'error': 'Another injection is currently running. Please wait.'}), 429

    try:
        payload = request.get_json()
        import json
        print("Full payload:\n", json.dumps(payload, indent=2))

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
            print("Injecting Elevation Sheet")
            sheet = wb.sheets["TakeOff Template"]

            # Inject metadata into LMNO15-20
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

            labor_rates = payload.get("laborRates", {})  # from frontend
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

            # Find next blank K cell from row 48 to 52 for custom labor
            custom_labor_start_row = 48
            max_labor_row = 52
            row_pointer = custom_labor_start_row

            while row_pointer <= max_labor_row:
                k_val = sheet.range(f"K{row_pointer}").value
                if not k_val or str(k_val).strip().lower() == "other labor":
                    break
                row_pointer += 1

            if row_pointer > max_labor_row:
                print("No space available for custom labor injections.")
                return jsonify({'error': 'No space left in the sheet for custom labor'}), 500

            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,
                metadata.get("materialType", ""),
                metadata.get("date", ""),
                metadata.get("estimator", "")
            ]

            print("Injecting metadata into TakeOff Template:", metadata_values)

            # Inject metadata into LMNO columns rows 15-20 (L=12, M=13, N=14, O=15)
            for row_index, value in enumerate(metadata_values, start=15):
                start_col = 12  # L
                end_col = 15    # O

                cell_range = sheet.range((row_index, start_col), (row_index, end_col))
                if cell_range.api.MergeCells:
                    cell_range.api.UnMerge()

                cell_range[0, 0].value = value
                cell_range.api.Merge()
                cell_range.api.HorizontalAlignment = -4108  # xlCenter
                cell_range.api.VerticalAlignment = -4108    # xlCenter

            # Clear A8:F100 columns (only specific columns cleared)
            sheet.range("A8:A100").clear_contents()
            sheet.range("C8:C100").clear_contents()
            sheet.range("E8:E100").clear_contents()
            sheet.range("F8:F100").clear_contents()

            non_labor_data, labor_data = split_labor(data)
            non_labor_data = sort_by_description(non_labor_data, key="Description")

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

            # Inject labor rates and quantities into rows 34-43 and 49-52
            # Handle mapped and unmapped labor keys

            # Inject labor rates in N column, qty in L column, and SKU in A column for labor_map keys
            for row_index in range(34, 44):
                k_cell = sheet.range(f"K{row_index}")
                n_cell = sheet.range(f"N{row_index}")
                l_cell = sheet.range(f"L{row_index}")
                a_cell = sheet.range(f"A{row_index}")

                raw_label = k_cell.value
                if not raw_label:
                    print(f"K{row_index} is empty, skipping")
                    continue

                label = str(raw_label).strip().lower()
                mapped_key = frontend_labor_keys.get(label)

                if mapped_key:
                    raw_value = labor_rates.get(mapped_key)
                    if raw_value not in (None, ""):
                        try:
                            n_cell.value = float(raw_value)
                            print(f"Injected ${raw_value} into N{row_index} for '{label}'")
                            sku = labor_map.get(label, "").strip()
                            matching_item = next(
                                (item for item in data if item.get("SKU", "").strip().upper() == sku.upper()),
                                None
                            )
                            qty = matching_item.get("TotalQty", 0) if matching_item else 0
                            l_cell.value = qty
                            a_cell.value = sku
                            print(f"Injected Qty {qty} into L{row_index} for '{label}'")
                        except ValueError:
                            print(f"Invalid float for '{mapped_key}' → N{row_index}: {raw_value}")
                    else:
                        print(f"No labor rate for '{mapped_key}', skipping N{row_index}")
                else:
                    print(f"Label '{label}' in K{row_index} not in frontend mapping")

            # Inject paint labor into L48
            paint_labor_raw = str(metadata.get("paintlabor") or "").strip()
            paint_labor_cleaned = re.sub(r'[^\d.\-]', '', paint_labor_raw)
            if paint_labor_cleaned:
                try:
                    sheet.range("L48").value = float(paint_labor_cleaned)
                    print(f"Paint Labor injected into L48: {paint_labor_cleaned}")
                except ValueError:
                    print(f"Invalid paint labor value after cleanup: {paint_labor_cleaned}")
            else:
                print("No paint labor value provided.")

            # Inject custom labor rates beyond predefined rows
            predefined_labor_fields = [
                {"name": "beamWrapLabor", "label": "Beam Wrap Labor rate", "airtableName": "Beam Wrap"},
                {"name": "bbLabor", "label": "B&B Labor rate", "airtableName": "Board & Batten"},
                {"name": "bracketLabor", "label": "Bracket Labor rate", "airtableName": "Brackets"},
                {"name": "ceilingLabor", "label": "Ceiling Labor rate", "airtableName": "Ceilings"},
                {"name": "columnLabor", "label": "Column Labor rate", "airtableName": "Column"},
                {"name": "lapLabor", "label": "Lap Labor rate", "airtableName": "Lap Siding"},
                {"name": "louverLabor", "label": "Louver Labor rate", "airtableName": "Louver"},
                {"name": "otherLabor", "label": "Other Labor rate", "airtableName": "Other"},
                {"name": "paintLabor", "label": "Paint Labor rate", "airtableName": "Paint"},
                {"name": "shakeLabor", "label": "Shake Labor rate", "airtableName": "Shake"},
                {"name": "shutterLabor", "label": "Shutter Labor rate", "airtableName": "Shutters"},
                {"name": "tngCeilingLabor", "label": "T&G Ceiling Labor rate", "airtableName": "T&G Ceiling"},
            ]

            mapped_keys = [field["name"] for field in predefined_labor_fields]

            # Filter unmapped labor keys with positive numeric value
            unmapped_labor_keys = [
                key for key in labor_rates
                if key.lower() not in labor_map
                and isinstance(labor_rates.get(key), (int, float))
                and labor_rates.get(key) > 0
                and key not in mapped_keys
            ]

            # Inject unmapped labor keys into empty "Other Labor" rows starting at row_pointer
            for row_index in list(range(49, 53)):
                k_val = sheet.range(f"K{row_index}").value
                n_cell = sheet.range(f"N{row_index}")
                l_cell = sheet.range(f"L{row_index}")
                a_cell = sheet.range(f"A{row_index}")

                if k_val and str(k_val).strip().lower() != "other labor":
                    continue

                if not unmapped_labor_keys:
                    break

                custom_key = unmapped_labor_keys.pop(0)
                try:
                    rate_val = float(labor_rates.get(custom_key, 0))
                    if rate_val <= 0:
                        print(f"Skipping custom labor '{custom_key}' due to zero or invalid rate.")
                        continue
                except (TypeError, ValueError):
                    print(f"Invalid value for custom labor '{custom_key}', skipping.")
                    continue

                fallback_sku = f"zLABOR{custom_key.replace('Labor', '').upper()}"
                matching_item = next(
                    (item for item in data if custom_key.lower().replace("labor", "") in item.get("SKU", "").lower()),
                    None
                )
                qty = matching_item.get("TotalQty", 0) if matching_item else 0
                custom_label = custom_key.replace("labor", " Labor").title()

                sheet.range(f"K{row_index}").value = custom_label
                a_cell.value = fallback_sku
                l_cell.value = qty
                n_cell.value = rate_val

                print(f"Injected custom labor '{custom_label}' → SKU: {fallback_sku} → Qty: {qty} into row {row_index}")

            # === Material Breakout Sheet Injection ===
        if data_type == "combined" or data_type.startswith("material_breakout"):
            print("Injecting Material Break Out Sheet")
            material_sheet = wb.sheets["Material Break Out"]
            material_sheet.range("A9:Z1000").clear_contents()
            current_row = 9

            filtered_breakout = [item for item in breakout_data if item.get("SKU", "").strip()]
            sorted_breakout = sort_by_description(filtered_breakout, key="Description")

            for item in sorted_breakout:
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
        print("Error in /inject:", str(e))
        return jsonify({'error': str(e)}), 500

    finally:
        injection_lock.release()


if __name__ == "__main__":
    from waitress import serve
    print("Starting server with Waitress on port 5000...")
    serve(app, host="0.0.0.0", port=5000)
