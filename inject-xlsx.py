from openpyxl import load_workbook
import json

# Load data from merged-data.json
with open("merged-data.json") as f:
    merged_data = json.load(f)

# Load your formatted .xlsx template
workbook = load_workbook("plan_module_takeoff_tool.xlsx")
sheet = workbook["TakeOff Template"]

start_row = 10
for i, row in enumerate(merged_data):
    r = start_row + i
    sheet[f"A{r}"] = row.get("SKU", "")
    sheet[f"B{r}"] = row.get("Description", "")
    sheet[f"D{r}"] = row.get("UOM", "")
    sheet[f"E{r}"] = row.get("TotalQty", 0)
    sheet[f"F{r}"] = row.get("ColorGroup", "")
    sheet[f"G{r}"] = row.get("Vendor", "")

workbook.save("downloads/plan_module_takeoff_tool85.xlsx")
