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
        import json
        print("🔍 Full payload:\n", json.dumps(payload, indent=2))

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
            predefined_sku_map = set(labor_map.values())  # ✅ Move here

            # 🔍 Dynamically find next blank K cell after predefined rows
            custom_labor_start_row = 48
            max_labor_row = 52
            row_pointer = custom_labor_start_row

            # 🔍 Dynamically find next blank K cell or one labeled "Other Labor"
            while row_pointer <= max_labor_row:
                k_val = sheet.range(f"K{row_pointer}").value
                if not k_val or str(k_val).strip().lower() == "other labor":
                    break
                row_pointer += 1



            if row_pointer > max_labor_row:
                print("⚠️ No space available for custom labor injections.")
                return jsonify({'error': 'No space left in the sheet for custom labor'}), 500

            metadata_values = [
                metadata.get("builder", ""),
                metadata.get("planName", ""),
                elevation_value,  
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

             # ✅ Clear and inject non-labor items into A–F starting row 8
            sheet.range("A8:A100").clear_contents()
            sheet.range("C8:C100").clear_contents()
            sheet.range("E8:E100").clear_contents()
            sheet.range("F8:F100").clear_contents()

        non_labor_data, _ = split_labor(data)
        non_labor_data = sorted(non_labor_data, key=lambda x: (x.get("Description") == "", (x.get("Description") or "").lower()))
        print("🔠 Injecting Elevation Description values:")

        print("🔠 Sorted Elevation Description values:")

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
                print(f"⚠️ K{row_index} is empty, skipping N{row_index}")
                continue

            label = str(raw_label).strip().lower()
            mapped_key = frontend_labor_keys.get(label)

            if mapped_key:
                raw_value = labor_rates.get(mapped_key)
                if raw_value not in (None, ""):
                    try:
                        n_cell.value = float(raw_value)
                        print(f"💰 Injected ${raw_value} into N{row_index} for '{label}'")
                        sku = labor_map.get(label, "").strip()
                # ✅ Also inject qty into L column
                        matching_item = next(
                            (item for item in data if item.get("SKU", "").strip().upper() == sku.upper()),
                            None
                        )
                        qty = matching_item.get("TotalQty", 0) if matching_item else 0
                        sheet.range(f"L{row_index}").value = qty
                        print(f"✅ Injected Qty {qty} into L{row_index} for '{label}'")

                    except ValueError:
                        print(f"⚠️ Invalid float for '{mapped_key}' → N{row_index}: {raw_value}")
                    except ValueError:
                        print(f"⚠️ Invalid float for '{mapped_key}' → N{row_index}: {raw_value}")
                else:
                    print(f"ℹ️ No labor rate for '{mapped_key}', skipping N{row_index}")
            else:
                print(f"❓ Label '{label}' in K{row_index} not in frontend mapping")



            # ✅ Inject Paint Labor value into cell L48
        paint_labor_raw = str(metadata.get("paintlabor") or "").strip()



            # Strip $ or any non-numeric characters
        import re
        paint_labor_cleaned = re.sub(r'[^\d.\-]', '', paint_labor_raw)

        if paint_labor_cleaned:
            try:
                sheet.range("L48").value = float(paint_labor_cleaned)
                print(f"🖌️ Paint Labor injected into L48: {paint_labor_cleaned}")
            except ValueError:
                print(f"⚠️ Invalid paint labor value after cleanup: {paint_labor_cleaned}")
        else:
            print("ℹ️ No paint labor value provided.")

       
            
    

            non_labor_data, labor_data = split_labor(data)
            non_labor_data = sorted(non_labor_data, key=lambda x: (x.get("Description") == "", (x.get("Description") or "").lower()))
            print("🔠 Sorted Elevation Description values:")

            for i, row in enumerate(non_labor_data, start=8):
                sku = row.get("SKU", "")
                desc2 = row.get("Description2", "")
                qty_raw = row.get("TotalQty", 0)
                color_group = row.get("ColorGroup", "")
                uom = (row.get("UOM") or "").strip().upper()

                is_labor = "labor" in sku.lower()
                skip_rounding = is_labor or uom == "SQ"
                total_qty = qty_raw if skip_rounding else math.ceil(qty_raw)


                sheet.range(f"A{i}").value = sku
                sheet.range(f"C{i}").value = desc2
                sheet.range(f"E{i}").value = total_qty
                sheet.range(f"F{i}").value = color_group


            folder_name = ((data[0].get("Folder") or metadata.get("elevation") or "")).strip().lower()


        used_labor_skus = set()
        all_labor_skus = [
            item.get("SKU", "")
            for item in data
            if "labor" in item.get("SKU", "").lower()
        ]

        alreadyInjectedOtherLabor = False  # ✅ track if we've already injected an "Other Labor"
        potential_labor = [key for key in labor_rates if key.lower() not in labor_map]

       # 🧠 Pull custom keys not in the map
        unmapped_labor_keys = [
            key for key in labor_rates
            if key.lower() not in labor_map
            and isinstance(labor_rates.get(key), (int, float))
            and float(labor_rates.get(key)) > 0
        ]

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
        unmapped_labor_keys = [key for key in unmapped_labor_keys if key not in mapped_keys]

        for row_index in list(range(34, 44)) + list(range(49, 53)):
            raw_val = sheet.range(f"K{row_index}").value
            if not raw_val:
                print(f"⚠️ K{row_index} is empty. Skipping.")
                continue

            labor_desc = str(raw_val).strip().lower()
            rate_cell = sheet.range(f"L{row_index}")
            sku_cell = sheet.range(f"A{row_index}")
            label_cell = sheet.range(f"K{row_index}")

    # ✅ Case 1: Direct match from map
            if labor_desc in labor_map:
                sku = labor_map[labor_desc]
                rate = labor_rates.get(labor_desc, None)
                if rate is not None:
                    print(f"✅ Injecting mapped labor '{labor_desc}' at row {row_index}")
                    rate_cell.value = rate
                    sku_cell.value = sku

    # ✅ Case 2: Use empty 'Other Labor' rows for unmapped labor
            elif "other labor" in labor_desc and not rate_cell.value:
                while unmapped_labor_keys and row_pointer <= max_labor_row:
                    custom_key = unmapped_labor_keys.pop(0)
                    try:
                        rate_val = float(labor_rates.get(custom_key, 0))
                        if rate_val <= 0:
                            print(f"⏩ Skipping custom labor '{custom_key}' due to 0 or invalid rate.")
                            continue
                    except (TypeError, ValueError):
                        print(f"⚠️ Invalid value for custom labor '{custom_key}', skipping.")
                        continue

                    custom_matches = [
                        item for item in data
                        if (
                            custom_key.lower().replace("labor", "") in item.get("SKU", "").lower()
                            or custom_key.lower().replace("labor", "") in item.get("Description", "").lower()
                            or custom_key.lower().replace("labor", "") in item.get("Folder", "").lower()
                        )
                    ]   

                    if not custom_matches:
                        print(f"⚠️ No match found for custom key '{custom_key}', using fallback SKU.")
                        fallback_sku = f"zLABOR{custom_key.replace('Labor', '').upper()}"
                        qty = 0
                    else:
                        custom_item = custom_matches[0]
                        fallback_sku = custom_item.get("SKU", f"zLABOR{custom_key.replace('Labor', '').upper()}")
                        qty = custom_item.get("TotalQty", 0)

                    custom_label = custom_key.replace("labor", " Labor").title()

                    sheet.range(f"K{row_pointer}").value = custom_label
                    sheet.range(f"A{row_pointer}").value = fallback_sku
                    sheet.range(f"L{row_pointer}").value = qty
                    sheet.range(f"N{row_pointer}").value = rate_val

                    print(f"✅ Injected custom labor '{custom_label}' → SKU: {fallback_sku} → Qty: {qty} into L{row_pointer}")

                    row_pointer += 1

                    if row_pointer > max_labor_row:
                        print("⚠️ Reached max custom labor row limit.")
                        break

                    


        for key, rate in labor_rates.items():
            if key in mapped_keys or not isinstance(rate, (int, float)) or rate <= 0:
                continue  # already handled or invalid

            label_clean = key.replace("Labor", "").replace("_", " ").title()
            sku = f"zLABOR{key.replace('Labor', '').upper()}"

                # Skip if this SKU is already used on the sheet
            existing_skus = [sheet.range(f"A{r}").value for r in range(34, 60)]
            if sku in existing_skus:
                print(f"⏭️ SKU '{sku}' already injected in earlier row, skipping duplicate.")
                continue

            # Skip if already injected
            if sku in predefined_sku_map:
                continue

            matching_item = next(
                (item for item in data
                 if item.get("SKU", "").strip().upper() == sku
                 and item.get("Folder", "").strip().lower() == folder_name),
                None
            )

            qty = float(matching_item["TotalQty"]) if matching_item else 0

            sheet.range(f"K{row_pointer}").value = f"{label_clean} Labor"
            sheet.range(f"N{row_pointer}").value = float(rate)
            sheet.range(f"L{row_pointer}").value = qty
            sheet.range(f"A{row_pointer}").value = sku

            print(f"✅ Injected custom labor '{label_clean}' → SKU: {sku} → Qty: {qty} into L{row_pointer}")

            row_pointer += 1

            if not injected:
                    print(f"🛑 No valid unmapped labor key found with value > 0 for row {row_index}")

                

            else:
                print(f"⏭️ Skipped row {row_index} — no match or already filled.")

    # Use next available unmapped SKU
                sku = potential_labor[0]
                used_labor_skus.add(sku)

    # Rename K cell to friendly name
                matching_desc = next(
                    (item.get("Description", "").strip() for item in data if item.get("SKU", "") == sku),
                    ""
                )
                if matching_desc:
                    new_label = matching_desc.lower().replace("labor -", "").strip().title() + " Labor"
                    sheet.range(f"K{row_index}").value = new_label
                    print(f"✏️ Renamed 'Other Labor' at K{row_index} → '{new_label}'")

                print(f"✅ Assigned SKU '{sku}' to 'Other Labor' at row {row_index}")

               


            qty = 0
            matching_item = next(
                (
                    item for item in data
                    if item.get("SKU", "").strip().lower() == sku.lower()
                    and item.get("Folder", "").strip().lower() == folder_name
                ),
                None
            )


            if matching_item:
                qty = matching_item.get("TotalQty", 0)
            else:
                qty = 0
                print(f"⚠️ No matching item found for SKU '{sku}' and folder '{folder_name}'. Injecting 0 qty.")


            if matching_item:
                qty = matching_item.get("TotalQty", 0)
                print(f"✅ Injected '{labor_desc}' → SKU: {sku} → Qty: {qty} into L{row_index}")
            else:
                print(f"⚠️ No matching item found for SKU '{sku}' and folder '{folder_name}'.")
                print(f"🚨 Attempted injection of '{sku}' for '{labor_desc}' but found no matching folder entry.")


            sheet.range(f"L{row_index}").value = qty
            print(f"✅ Injected '{labor_desc}' → SKU: {sku} → Qty: {qty} into L{row_index}")

        # === Material Breakout Sheet Injection ===
        if data_type == "combined" or data_type.startswith("material_breakout"):
            print("📄 Injecting Material Break Out Sheet")
            material_sheet = wb.sheets["Material Break Out"]
            material_sheet.range("A9:Z1000").clear_contents()
            current_row = 9

            filtered_breakout = [item for item in breakout_data if item.get("SKU", "").strip()]
            sorted_breakout = sort_by_description(filtered_breakout, key="Description")
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
