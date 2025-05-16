

const express = require('express');
const cors = require('cors'); // ✅ moved below express
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const port = 3001;

const app = express(); // ✅ make sure this is before app.use()

app.use(cors());       // ✅ now safe to call
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public')); // serve index.html, script.js, etc.

app.post('/inject-xlsb', upload.single('data'), (req, res) => {
    try {
      const mergedData = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
      fs.unlinkSync(req.file.path);
  
      const inputFile = 'plan module takeoff tool - rev. database011525.xlsb';
      const outputFile = 'output.xlsb';
      const sheetName = 'TakeOff Template';
      const startingRow = 10;
  
      if (!fs.existsSync(inputFile)) {
        return res.status(500).send("Template file not found.");
      }
  
      const workbook = XLSX.readFile(inputFile, { bookVBA: true });
      const worksheet = workbook.Sheets[sheetName];
  
      if (!worksheet) {
        return res.status(500).send(`Sheet "${sheetName}" not found.`);
      }
  
      function isCellEmpty(cellRef) {
        const cell = worksheet[cellRef];
        return !cell || !cell.v;
      }
  
      let row = startingRow;
      mergedData.forEach(item => {
        const skuCell = `A${row}`;
        const descCell = `B${row}`;
        const qtyCell = `E${row}`;
        const colorCell = `F${row}`;
  
        if (isCellEmpty(skuCell) && isCellEmpty(descCell) && isCellEmpty(qtyCell)) {
          worksheet[skuCell] = { t: 's', v: item.SKU };
          worksheet[descCell] = { t: 's', v: item.Description };
          worksheet[qtyCell] = { t: 'n', v: item.TotalQty };
          worksheet[colorCell] = { t: 's', v: item.ColorGroup };
        }
  
        row++;
      });
  
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      range.e.r = Math.max(range.e.r, row);
      worksheet['!ref'] = XLSX.utils.encode_range(range);
  
      XLSX.writeFile(workbook, outputFile, { bookType: 'xlsb', bookVBA: true });
  
      res.download(outputFile);
    } catch (err) {
      console.error('❌ Injection failed:', err.message);
      res.status(500).send("Injection failed: " + err.message);
    }
  });
  

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
