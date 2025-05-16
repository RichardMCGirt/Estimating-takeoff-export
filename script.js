let mergedData = [];
let mappedWorkbook = null;

document.getElementById('sourceFile').addEventListener('change', handleSourceUpload);
document.getElementById('targetFile').addEventListener('change', handleTargetUpload);
// document.getElementById('downloadButton').addEventListener('click', downloadMappedExcel);

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
    renderFolderButtons(); // <-- add this here

    document.getElementById('targetFile').disabled = false;
  };
  reader.readAsArrayBuffer(file);
}
function downloadFolderSheet(folderName) {
    const folderData = mergedData.filter(d => d.Folder === folderName);
    if (!folderData.length) {
      alert(`No data found for folder "${folderName}".`);
      return;
    }
  
    // Sort like in displayMergedTable
    const nonLaborRows = folderData.filter(d => !/labor/i.test(d.SKU))
      .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
    const laborRows = folderData.filter(d => /labor/i.test(d.SKU))
      .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
    const sortedRows = [...nonLaborRows, ...laborRows];
  
    const workbook = XLSX.read(data, { type: 'array', bookVBA: true }); // Add bookVBA for macro support

const sheet = XLSX.utils.json_to_sheet(updatedData); // This still won't keep formatting

workbook.Sheets["Sheet1"] = sheet; // Overwrite specific sheet only

const wbout = XLSX.write(workbook, { bookType: 'xlsb', type: 'array', bookVBA: true });

    const blob = new Blob([wbout], { type: "application/octet-stream" });
  
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheetName.replace(/[^a-zA-Z0-9-_]/g, '_')}_Mapped.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
function handleTargetUpload(event) {
    const file = event.target.files[0];
    if (!file || !mergedData.length) return;
  
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      XLSX.read(data, { type: 'array' }); // Optional: Read existing file structure, not reused
  
      // Create a fresh workbook
      const newWorkbook = XLSX.utils.book_new();
  
      // Get unique folders (e.g., Elevation A, Elevation B)
      const folders = [...new Set(mergedData.map(d => d.Folder))];
  
      folders.forEach(folder => {
        const allRows = mergedData.filter(d => d.Folder === folder);
  
        const nonLaborRows = allRows.filter(d => !/labor/i.test(d.SKU))
          .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
        const laborRows = allRows.filter(d => /labor/i.test(d.SKU))
          .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
  
        const sortedRows = [...nonLaborRows, ...laborRows];
  
        const sheet = XLSX.utils.json_to_sheet(sortedRows, {
          header: ["SKU", "Description", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
        });
  
        // Sheet names must be 31 characters max
        const sheetName = folder.substring(0, 31);
        XLSX.utils.book_append_sheet(newWorkbook, sheet, sheetName);
      });
  
      // Store for download
      mappedWorkbook = newWorkbook;
      document.getElementById('downloadButton').disabled = false;
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
      const allRows = data.filter(d => d.Folder === folder);
      const nonLaborRows = allRows.filter(d => !/labor/i.test(d.SKU))
        .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
      const laborRows = allRows.filter(d => /labor/i.test(d.SKU))
        .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
  
      const sortedRows = [...nonLaborRows, ...laborRows]; // Labor at bottom
  
      const tableId = `copyTable_${index}`;
      let tsvContent = `SKU\tDescription\tUOM\t\t\tQTY\tColor Group\n`;
  
      html += `<h3>${folder}</h3>
        <button onclick="copyToClipboard('${tableId}')">Copy Table to Clipboard</button>
        <textarea id="${tableId}" style="width:0; height:0; position:absolute; left:-9999px;">`;
  
      sortedRows.forEach(row => {
        tsvContent += `${row.SKU}\t${row.Description}\t\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
      });
  
      html += `${tsvContent.trim()}</textarea><table><thead><tr>
          <th>SKU</th>
          <th>Description</th>
          <th>QTY</th>
          <th>Color Group</th>
        </tr></thead><tbody>`;
  
      sortedRows.forEach(row => {
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

  function renderFolderButtons() {
    const container = document.getElementById('folderButtons');
    container.innerHTML = ''; // Clear previous buttons
  
    const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
    if (!uniqueFolders.length) {
      container.innerHTML = '<p>No folders available yet.</p>';
      return;
    }
  
    uniqueFolders.forEach(folder => {
      const button = document.createElement('button');
      button.textContent = folder;
      button.style.margin = '6px';
      button.onclick = () => downloadFolderSheet(folder);
      container.appendChild(button);
    });
  }
  


  function promptAndDownloadFolder() {
    if (!mergedData.length) {
      alert("No merged data available yet. Upload a source file first.");
      return;
    }
  
    const availableFolders = [...new Set(mergedData.map(d => d.Folder))];
    const folderName = prompt(`Enter a folder name to download:\n\nAvailable:\n${availableFolders.join('\n')}`);
  
    if (!folderName) return;
  
    const folderData = mergedData.filter(d => d.Folder === folderName);
    if (!folderData.length) {
      alert(`No data found for folder "${folderName}".`);
      return;
    }
  
    // Sort like in displayMergedTable
    const nonLaborRows = folderData.filter(d => !/labor/i.test(d.SKU))
      .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
    const laborRows = folderData.filter(d => /labor/i.test(d.SKU))
      .sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
    const sortedRows = [...nonLaborRows, ...laborRows];
  
    // Create workbook with single sheet
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(sortedRows, {
      header: ["SKU", "Description", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
    });
  
    const sheetName = folderName.substring(0, 31); // Excel limit
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  
    // Download
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
  
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheetName.replace(/[^a-zA-Z0-9-_]/g, '_')}_Mapped.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  
  
  function downloadMergedDataAsJSON() {
    if (!mergedData.length) {
      alert("No merged data to export.");
      return;
    }
  
    const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'merged-data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
downloadMergedDataAsJSON

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

function sendMergedDataToServer() {
    if (!mergedData.length) {
      alert("No merged data to send.");
      return;
    }
  
    const blob = new Blob([JSON.stringify(mergedData)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('data', blob, 'merged-data.json');
  
    fetch('http://localhost:3001/inject-xlsb', {
        method: 'POST',
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to process');
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Updated_Macro_Template.xlsb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => {
        console.error(err);
        alert('Something went wrong injecting into .xlsb');
      });
  }
  