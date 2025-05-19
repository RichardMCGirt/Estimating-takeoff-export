const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cors = require('cors');

const app = express();
const upload = multer();
app.use(cors());

const templatePath = path.join(__dirname, 'plan-module-takeoff-tool.xlsb');
const outputPath = path.join(__dirname, 'downloads', 'Updated_Macro_Template.xlsb');

app.post('/inject-xlsb', upload.single('data'), (req, res) => {
  try {
    console.log("📥 Received injection request to /inject-xlsb");

    const mergedData = JSON.parse(req.file.buffer.toString());
    console.log(`📊 Parsed ${mergedData.length} rows from uploaded JSON`);

    // Load the workbook
    const workbook = XLSX.readFile(templatePath, { bookVBA: true });
    console.log('📄 Sheet names in template before cleanup:', workbook.SheetNames);

    const sheetName = 'TakeOff Template';
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      console.error(`❌ Sheet "${sheetName}" not found in workbook`);
      return res.status(400).send(`❌ Sheet "${sheetName}" not found.`);
    }

    // 🔒 Delete all other sheets to ensure only 'TakeOff Template' remains
    workbook.SheetNames = [sheetName];
    Object.keys(workbook.Sheets).forEach(name => {
      if (name !== sheetName) {
        console.log(`🗑️ Removing sheet: ${name}`);
        delete workbook.Sheets[name];
      }
    });

    console.log(`✅ Preparing to inject data into "${sheetName}" starting from row 8`);

    // Optional: Clear rows A–H from row 8 down (if needed)
    for (let r = 8; r < 500; r++) {
      ['A', 'B', 'D', 'E', 'F', 'G', 'H'].forEach(col => {
        const cell = `${col}${r}`;
        if (sheet[cell]) {
          delete sheet[cell];
          // Uncomment to log each cleared cell: console.log(`🧹 Cleared ${cell}`);
        }
      });
    }

    // Inject new data starting from row 8
    const startRow = 8;
    mergedData.forEach((row, index) => {
      const r = startRow + index;
      sheet[`A${r}`] = { t: 's', v: row.SKU || '' };
      sheet[`B${r}`] = { t: 's', v: row.Description || '' };
      sheet[`D${r}`] = { t: 's', v: row.UOM || '' };
      sheet[`E${r}`] = { t: 'n', v: row.TotalQty || 0 };
      sheet[`F${r}`] = { t: 's', v: row.ColorGroup || '' };
      sheet[`G${r}`] = { t: 's', v: row.Vendor || '' };
      sheet[`H${r}`] = { t: 'n', v: row.UnitCost || 0 };
    });

    console.log(`📝 Injected ${mergedData.length} rows into "${sheetName}"`);

    // Save the workbook
    XLSX.writeFile(workbook, outputPath, { bookType: 'xlsb', bookVBA: true });
    console.log(`💾 Saved updated XLSB to ${outputPath}`);
    console.log("✅ Injection process complete");

    res.status(200).send('✅ Data injected into TakeOff Template.');
  } catch (err) {
    console.error('❌ Injection error:', err);
    res.status(500).send('❌ Error injecting into XLSB.');
  }
});
