import xlwings as xw
import json
import os
import sys
import datetime
import pathlib
import shutil
import time
import subprocess

print("📦 Starting script...")

executable_path = pathlib.Path(sys.executable)
print(f"🛠️ Running from: {executable_path.name}")

json_path = sys.argv[1] if len(sys.argv) > 1 else "merged-data.json"

try:
    with open(json_path) as f:
        merged_data = json.load(f)
    print(f"✅ Loaded {len(merged_data)} records from {json_path}")
except Exception as e:
    print(f"❌ Failed to load {json_path}: {e}")
    exit()

base_name = os.path.splitext(os.path.basename(json_path))[0]
folder_label = base_name.replace("merged-data-", "") or "output"
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
output_filename = f"{folder_label}_Vanir_Takeoff_{timestamp}.xlsb"

downloads_path = os.path.join(os.getcwd(), "downloads")
os.makedirs(downloads_path, exist_ok=True)
output_path = os.path.abspath(os.path.join(downloads_path, output_filename))
print(f"📁 Output path: {output_path}")

template_path = os.path.abspath("plan.xlsb")
if not os.path.exists(template_path):
    print(f"❌ Template file not found: {template_path}")
    exit()

shutil.copy(template_path, output_path)
print(f"📄 Copied template to: {output_path}")

try:
    wb = xw.Book(output_path)
    wb.app.visible = True
    print("✅ Opened copied workbook")
except Exception as e:
    print(f"❌ Failed to open copied workbook: {e}")
    exit()



# Labor map defined only once
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

# Inject data to A:G
start_row = 8
labor_skus = set(labor_map.values())  # Make this above the loop

non_labor_data = [row for row in merged_data if row.get("SKU", "") not in labor_skus]

for i, row in enumerate(non_labor_data):
    r = start_row + i
    sheet.range(f"A{r}").value = row.get("SKU", "")
    sheet.range(f"B{r}").value = row.get("Description", "")
    sheet.range(f"C{r}").value = row.get("Description2", "")
    sheet.range(f"D{r}").value = row.get("UOM", "")
    sheet.range(f"E{r}").value = row.get("TotalQty", 0)
    sheet.range(f"F{r}").value = row.get("ColorGroup", "")
    sheet.range(f"G{r}").value = row.get("Vendor", "")

    print(f"✏️ Row {r}: {row.get('SKU', '')} | Desc1: {row.get('Description', '')} | Desc2: {row.get('Description2', '')}")




labor_skus = set(labor_map.values())
# DEBUG: show all cleaned descriptions in merged_data
print("📋 Available descriptions in merged_data:")
for item in merged_data:
    print(f"• {str(item.get('Description', '')).strip().lower()}")

print("🔍 Starting labor quantity mapping...")
for row in range(34, 44):
    raw_val = sheet.range(f"K{row}").value
    if not raw_val:
        print(f"⚠️ Row {row}: Empty K cell, skipping")
        continue

    labor_desc = str(raw_val).strip().lower()
    print(f"🔎 Row {row} K{row}='{raw_val}' → searching for '{labor_desc}'")

    sku = labor_map.get(labor_desc)

    if sku:
        # Lookup TotalQty in merged_data based on SKU
        qty_item = next(
            (item for item in merged_data if item.get("SKU", "").strip().lower() == sku.lower()),
            None
        )

        if qty_item:
            total_qty = qty_item.get("TotalQty", 0)
            sheet.range(f"L{row}").value = total_qty  # ✅ Write quantity only
            print(f"✅ Row {row}: Mapped '{labor_desc}' → Qty: {total_qty}")
        else:
            sheet.range(f"L{row}").value = ""
            print(f"⚠️ Row {row}: SKU '{sku}' found in map, but not in merged_data — no quantity written.")

        continue

    # Fallback: try matching by description
    matching_item = next(
        (item for item in merged_data if labor_desc in str(item.get("Description", "")).strip().lower()),
        None
    )

    if matching_item:
        total_qty = matching_item.get("TotalQty", 0)
        sheet.range(f"L{row}").value = total_qty
        print(f"✅ Row {row}: Fallback matched '{labor_desc}' → Qty: {total_qty}")
    else:
        sheet.range(f"L{row}").value = ""
        print(f"❌ Row {row}: No match found for '{labor_desc}'")


try:
    wb.save(output_path)
    time.sleep(0.5)
    wb.close()
    time.sleep(0.5)
    wb.app.quit()
    print(f"✅ Saved and closed workbook: {output_path}")
except Exception as e:
    print(f"❌ Failed to save/close file: {e}")

subprocess.Popen(["start", "excel", output_path], shell=True)
print("🚀 Reopened in Excel for user editing (detached from script)")