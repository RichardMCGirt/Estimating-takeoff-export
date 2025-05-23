from flask import Flask, request, jsonify
from flask_cors import CORS
import xlwings as xw
import os
import datetime

# 🔧 Create the Flask app before using it
app = Flask(__name__)
CORS(app)

# ✅ NOW define your route AFTER app exists
import traceback

@app.route('/inject', methods=['POST'])
def inject():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON received'}), 400

        print(f"✅ Received {len(data)} records.")
        ...

   


        # ✅ Generate human-readable timestamp and use Downloads folder
        timestamp = datetime.datetime.now().strftime('%Y-%m-%d_%I-%M%p')
        downloads_folder = os.path.join(os.path.expanduser("~"), "Downloads")
        os.makedirs(downloads_folder, exist_ok=True)  # Ensure Downloads exists
        output_path = os.path.join(downloads_folder, f"Vanir_Takeoff_{timestamp}.xlsb")

        # 📄 Copy the Excel template
        template_path = os.path.join(os.getcwd(), "plan.xlsb")
        with open(template_path, 'rb') as f:
            content = f.read()
        with open(output_path, 'wb') as f:
            f.write(content)

        xl_app = xw.App(visible=False)
        wb = xw.Book(output_path)
        sheet = wb.sheets["TakeOff Template"]

        # 🔧 Labor SKUs
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

        labor_skus = set(labor_map.values())
        non_labor_data = [row for row in data if row.get("SKU", "") not in labor_skus]

        # ✅ Write non-labor records to A:G starting at row 8
        start_row = 8
        for i, row in enumerate(non_labor_data):
            r = start_row + i
            sheet.range(f"A{r}").value = row.get("SKU", "")
            sheet.range(f"B{r}").value = row.get("Description", "")
            sheet.range(f"C{r}").value = row.get("Description2", "")
            sheet.range(f"D{r}").value = row.get("UOM", "")
            sheet.range(f"E{r}").value = row.get("TotalQty", 0)
            sheet.range(f"F{r}").value = row.get("ColorGroup", "")
            sheet.range(f"G{r}").value = row.get("Vendor", "")

        # ✅ Map labor qtys to L34–L43 based on K values
        for row_idx in range(34, 44):
            raw_val = sheet.range(f"K{row_idx}").value
            if not raw_val:
                continue

            labor_desc = str(raw_val).strip().lower()
            sku = labor_map.get(labor_desc)

            qty_item = None
            if sku:
                qty_item = next((item for item in data if item.get("SKU", "").lower() == sku.lower()), None)

            if not qty_item:
                # Try matching description instead
                qty_item = next(
                    (item for item in data if labor_desc in str(item.get("Description", "")).lower()),
                    None
                )

            qty = qty_item.get("TotalQty", "") if qty_item else ""
            sheet.range(f"L{row_idx}").value = qty

        wb.save()
        wb.close()
        xl_app.quit()

     return jsonify({'message': 'Excel file created', 'path': output_path})

    except Exception as e:
        print("❌ Exception occurred:")
        traceback.print_exc()  # ← ✅ This will show the real error in Azure logs
        return jsonify({'error': str(e)}), 500


# ✅ Don't forget to run it
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)

