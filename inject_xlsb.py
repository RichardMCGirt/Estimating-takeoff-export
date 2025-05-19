import json
import win32com.client as win32
import os
import sys

json_path = sys.argv[1]
xlsb_path = sys.argv[2]
output_path = sys.argv[3]

with open(json_path, 'r') as f:
    merged_data = json.load(f)

excel = win32.gencache.EnsureDispatch('Excel.Application')
excel.Visible = False

# Open the template
wb = excel.Workbooks.Open(os.path.abspath(xlsb_path))
ws = wb.Sheets("TakeOff Template")  # Ensure correct sheet is selected

# Clear rows 8–500 (without deleting formatting)
for i in range(8, 500):
    ws.Rows(i).ClearContents()

# Copy format from row 7 into every injected row
template_row_index = 7
start_row = 8

for idx, row in enumerate(merged_data):
    target_row = start_row + idx

    # Copy formatting from row 7
    ws.Rows(template_row_index).Copy()
    ws.Rows(target_row).PasteSpecial(Paste=-4104)  # xlPasteFormats

    # Inject values
    ws.Cells(target_row, 1).Value = row.get("SKU", "")
    ws.Cells(target_row, 2).Value = row.get("Description", "")
    ws.Cells(target_row, 4).Value = row.get("UOM", "")
    ws.Cells(target_row, 5).Value = row.get("TotalQty", 0)
    ws.Cells(target_row, 6).Value = row.get("ColorGroup", "")
    ws.Cells(target_row, 7).Value = row.get("Vendor", "")
    ws.Cells(target_row, 8).Value = row.get("UnitCost", 0)

# Optional: extend Excel table if used (can be automated with table name)

# Save output
wb.SaveAs(os.path.abspath(output_path), FileFormat=50)  # .xlsb
wb.Close(SaveChanges=False)
excel.Quit()

print("✅ Injection complete with formatting preserved.")
