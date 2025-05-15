let mergedData = [];
let mappedWorkbook = null;

document.getElementById('sourceFile').addEventListener('change', handleSourceUpload);
document.getElementById('targetFile').addEventListener('change', handleTargetUpload);
document.getElementById('downloadButton').addEventListener('click', downloadMappedExcel);

function handleSourceUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    mergedData = mergeBySKU(json);
    displayMergedTable(mergedData);

    document.getElementById('targetFile').disabled = false;
  };
  reader.readAsArrayBuffer(file);
}

function mergeBySKU(data) {
const result = {};
data.forEach(row => {
const sku = row["SKU#"] || row["SKU"];
const folder = row["Folder"];
const qty = parseFloat(row["Qty"]) || 0;
if (!sku || !folder) return;

const key = `${sku}___${folder}`;
if (!result[key]) {
  result[key] = {
    SKU: sku,
    Description: row["Description"] || "",
    UOM: row["UOM"] || "",
    Folder: folder,
    ColorGroup: row["Color Group"] || "",
    Vendor: row["Vendor"] || "",
    UnitCost: parseFloat(row["Unit Cost"]) || 0,
    TotalQty: 0
  };
}
result[key].TotalQty += qty;
});

return Object.values(result);
}


function displayMergedTable(data) {
const container = document.getElementById("mergedTableContainer");
if (!data.length) {
container.innerHTML = "<p>No merged data found.</p>";
return;
}

const folders = [...new Set(data.map(d => d.Folder))];
let html = "";

folders.forEach((folder, index) => {
const rows = data.filter(d => d.Folder === folder);
const tableId = `copyTable_${index}`;
let tsvContent = `SKU\tDescription\tUOM\t\t\tQTY\tColor Group\n`;

html += `<h3>${folder}</h3>
  <button onclick="copyToClipboard('${tableId}')">Copy Table to Clipboard</button>
  <textarea id="${tableId}" style="width:0; height:0; position:absolute; left:-9999px;">`;

rows.forEach(row => {
  const totalCost = (row.UnitCost * row.TotalQty).toFixed(2);
  tsvContent += `${row.SKU}\t${row.Description}\t\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
});

html += `${tsvContent.trim()}</textarea><table><thead><tr>
    <th>SKU</th>
    <th>Description</th>

    <th>QTY</th>
    <th>Color Group</th>

  </tr></thead><tbody>`;

rows.forEach(row => {
  const totalCost = (row.UnitCost * row.TotalQty).toFixed(2);
  html += `<tr>
    <td>${row.SKU}</td>
<td>${row.Description}</td>

<td>${row.TotalQty.toFixed(2)}</td>
<td>${row.ColorGroup}</td>


  </tr>`;
});

html += `</tbody></table><br/>`;
});

container.innerHTML = html;
}


// Helper to copy from hidden textarea
function copyToClipboard(textareaId) {
const textarea = document.getElementById(textareaId);
const lines = textarea.value.trim().split("\n");

// Skip the first row (usually the header)
const trimmedLines = lines.slice(1);


const modifiedText = trimmedLines.join("\n");

// Create a temporary textarea to copy
const tempTextarea = document.createElement("textarea");
tempTextarea.value = modifiedText;
document.body.appendChild(tempTextarea);
tempTextarea.select();
document.execCommand("copy");
document.body.removeChild(tempTextarea);
}


function downloadMappedExcel() {
  if (!mappedWorkbook) return;
  const wbout = XLSX.write(mappedWorkbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: "application/octet-stream" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Mapped_File.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}