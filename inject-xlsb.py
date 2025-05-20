import xlwings as xw
import json
import os
import sys

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
base_name = os.path.splitext(os.path.basename(json_path))[0]  # e.g. "merged-data-ElevationA"
folder_label = base_name.replace("merged-data-", "") or "output"
output_filename = f"{folder_label}_Takeoff.xlsb"

# Ensure output folder exists
downloads_path = os.path.join(os.getcwd(), "downloads")
os.makedirs(downloads_path, exist_ok=True)
output_path = os.path.abspath(os.path.join(downloads_path, output_filename))
print(f"📁 Output path: {output_path}")

# Open your macro-enabled workbook
try:
    wb = xw.Book("plan.xlsb")
    print("✅ Opened plan.xlsb")
except Exception as e:
    print(f"❌ Failed to open .xlsb file: {e}")
    exit()

# Access the correct worksheet
try:
    sheet = wb.sheets["TakeOff Template"]
    print("✅ Accessed sheet: TakeOff Template")
except Exception as e:
    print(f"❌ Failed to access sheet: {e}")
    wb.close()
    exit()

# Inject data
start_row = 8
for i, row in enumerate(merged_data):
    r = start_row + i
    sheet.range(f"A{r}").value = row.get("SKU", "")
    sheet.range(f"B{r}").value = row.get("Description", "")
    sheet.range(f"D{r}").value = row.get("UOM", "")
    sheet.range(f"E{r}").value = row.get("TotalQty", 0)
    sheet.range(f"F{r}").value = row.get("ColorGroup", "")
    sheet.range(f"G{r}").value = row.get("Vendor", "")

print("✅ Data written to sheet")

# Save workbook with dynamic name
try:
    wb.save(output_path)
    wb.close()
    print(f"✅ Saved successfully: {output_path}")
except Exception as e:
    print(f"❌ Failed to save file: {e}")
