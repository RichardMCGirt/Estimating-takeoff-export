import xlwings as xw
import json
import os
import sys
import datetime

print("📦 Starting script...")

# Accept filename from command-line
json_path = sys.argv[1] if len(sys.argv) > 1 else "merged-data.json"

# Load merged data
try:
    with open(json_path) as f:
        merged_data = json.load(f)
    print(f"✅ Loaded {len(merged_data)} records from {json_path}")
except Exception as e:
    print(f"❌ Failed to load {json_path}: {e}")
    exit()

# Extract base name for dynamic output
base_name = os.path.splitext(os.path.basename(json_path))[0]
folder_label = base_name.replace("merged-data-", "") or "output"

# Generate output filename with timestamp
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
output_filename = f"{folder_label}_Vanir_Takeoff_{timestamp}.xlsb"

# Ensure output folder exists
downloads_path = os.path.join(os.getcwd(), "downloads")
os.makedirs(downloads_path, exist_ok=True)
output_path = os.path.abspath(os.path.join(downloads_path, output_filename))
print(f"📁 Output path: {output_path}")

# Open workbook
import shutil

template_path = os.path.abspath("plan.xlsb")
shutil.copy(template_path, output_path)
print(f"📄 Copied template to: {output_path}")

# Now open the copied workbook
try:
    wb = xw.Book(output_path)
    print("✅ Opened copied workbook")
except Exception as e:
    print(f"❌ Failed to open copied workbook: {e}")
    exit()


# Access worksheet
try:
    sheet = wb.sheets["TakeOff Template"]
    print("✅ Accessed sheet: TakeOff Template")
except Exception as e:
    print(f"❌ Failed to access sheet: {e}")
    wb.close()
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


# Save workbook
# Save workbook
try:
    wb.save(output_path)
    wb.close()         # ✅ Close the workbook
    wb.app.quit()      # ✅ Quit the Excel application opened by xlwings
    print(f"✅ Saved and closed workbook: {output_path}")
except Exception as e:
    print(f"❌ Failed to save/close file: {e}")

# Re-open Excel independently so it stays open even if PowerShell is closed
import subprocess
subprocess.Popen(["start", "excel", output_path], shell=True)
print("🚀 Reopened in Excel for user editing (detached from script)")
