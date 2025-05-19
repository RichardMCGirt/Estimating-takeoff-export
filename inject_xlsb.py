import win32com.client as win32
import json

# Load your merged data
with open('merged-data.json', 'r') as f:
    merged_data = json.load(f)

excel = win32.gencache.EnsureDispatch('Excel.Application')
excel.Visible = False  # Set to True for debugging
wb = excel.Workbooks.Open(r'path\to\plan-module-takeoff-tool.xlsb')
ws = wb.Sheets('TakeOff Template')

# Clear old data from row 8 down
for row in range(8, 500):
    ws.Range(f"A{row}:H{row}").ClearContents()

# Inject new data starting at row 8
for i, row in enumerate(merged_data, start=8):
    ws.Cells(i, 1).Value = row.get("SKU", "")
    ws.Cells(i, 2).Value = row.get("Description", "")
    ws.Cells(i, 4).Value = row.get("UOM", "")
    ws.Cells(i, 5).Value = row.get("TotalQty", 0)
    ws.Cells(i, 6).Value = row.get("ColorGroup", "")
    ws.Cells(i, 7).Value = row.get("Vendor", "")
    ws.Cells(i, 8).Value = row.get("UnitCost", 0)

# Save as new file (preserves everything)
wb.SaveAs(r'path\to\Updated_Macro_Template.xlsb', FileFormat=50)
wb.Close(False)
excel.Quit()
