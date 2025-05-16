const XLSX = require('xlsx');
const fs = require('fs');

const inputFile = 'plan module takeoff tool - rev. database011525.xlsb';
const outputFile = 'plan-module-takeoff-tool-updated.xlsb';
const sheetName = 'TakeOff Template';
const startingRow = 10;

const mergedData = JSON.parse(fs.readFileSync('merged-data.json', 'utf8')); // ✅ Your real data

const workbook = XLSX.readFile(inputFile, { bookVBA: true });
const worksheet = workbook.Sheets[sheetName];

if (!worksheet) {
  console.error(`❌ Sheet "${sheetName}" not found.`);
  process.exit(1);
}

function isCellEmpty(cellRef) {
  const cell = worksheet[cellRef];
  return !cell || !cell.v;
}

let row = startingRow;
mergedData.forEach((item) => {
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

// Extend worksheet range
const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
range.e.r = Math.max(range.e.r, row);
worksheet['!ref'] = XLSX.utils.encode_range(range);

// Save updated file
XLSX.writeFile(workbook, outputFile, { bookType: 'xlsb', bookVBA: true });
console.log(`✅ Data from merged-data.json inserted into '${sheetName}' and saved to '${outputFile}'`);
