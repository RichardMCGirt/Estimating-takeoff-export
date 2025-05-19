const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cors = require('cors');
const filePath = path.join(__dirname, 'downloads', 'Updated_Macro_Template.xlsb');

const app = express();
app.use(cors()); // ✅ Enable CORS for all origins

const upload = multer();

// Adjust this path as needed
const templatePath = path.join(__dirname, 'plan-module-takeoff-tool.xlsb');
const outputPath = path.join(__dirname, 'downloads', 'Updated_Macro_Template.xlsb');

app.post('/inject-xlsb', upload.single('data'), (req, res) => {
  try {
    const mergedData = JSON.parse(req.file.buffer.toString());

    // Read the macro-enabled .xlsb template
    const workbook = XLSX.readFile(templatePath, { bookVBA: true });
    const sheetName = 'TakeOff Template'; // adjust if needed

    // Inject new sheet
    const newSheet = XLSX.utils.json_to_sheet(mergedData, {
      header: ["SKU", "Description", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
    });

    XLSX.utils.book_append_sheet(workbook, newSheet, 'MergedData');

    // Save to local server folder
    XLSX.writeFile(workbook, outputPath, { bookType: 'xlsb', bookVBA: true });

    res.status(200).send('✅ XLSB file updated and saved to server.');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error processing XLSB injection.');
  }
});
app.get('/download-xlsb', (req, res) => {
    res.download(filePath, 'Updated_Macro_Template.xlsb', err => {
      if (err) {
        console.error("❌ File download error:", err);
        res.status(500).send("Failed to download file.");
      }
    });
  });

app.listen(3001, () => {
  console.log("✅ Server listening on port 3001");
});
