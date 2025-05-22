@app.route('/inject', methods=['POST'])
def inject():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON received'}), 400

        print("✅ Received data:", data)

        # Path to your Excel template
        template_path = os.path.join(os.getcwd(), "plan.xlsb")

        # Output path (timestamped)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = os.path.join(os.getcwd(), f"Vanir_Takeoff_{timestamp}.xlsb")

        # Copy template to new file
        with open(template_path, 'rb') as f:
            content = f.read()
        with open(output_path, 'wb') as f:
            f.write(content)

        # Inject using xlwings
        app = xw.App(visible=False)
        wb = xw.Book(output_path)

        sht = wb.sheets[0]
        row = 2
        for item in data:
            sht.range(f"A{row}").value = item.get("SKU", "")
            sht.range(f"B{row}").value = item.get("Description", "")
            sht.range(f"C{row}").value = item.get("Description2", "")
            sht.range(f"D{row}").value = item.get("UOM", "")
            sht.range(f"E{row}").value = item.get("Folder", "")
            sht.range(f"F{row}").value = item.get("ColorGroup", "")
            sht.range(f"G{row}").value = item.get("Vendor", "")
            sht.range(f"H{row}").value = item.get("UnitCost", 0)
            sht.range(f"I{row}").value = item.get("TotalQty", 0)
            row += 1

        wb.save()
        wb.close()
        app.quit()

        return jsonify({'message': 'Excel file created', 'path': output_path})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
