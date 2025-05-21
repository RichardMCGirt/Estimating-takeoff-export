let mergedData = [];
let mappedWorkbook = null;

document.getElementById('sourceFile').addEventListener('change', handleSourceUpload);


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
    renderFolderButtons();
    

  };
  reader.readAsArrayBuffer(file);
}

function showToast(message = "Success!") {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.warn("⚠️ Toast element not found.");
    return;
  }

  toast.textContent = message;
  toast.style.visibility = "visible";
  toast.style.opacity = "1";
  toast.style.bottom = "50px";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.bottom = "30px";
    setTimeout(() => {
      toast.style.visibility = "hidden";
    }, 300);
  }, 2000);
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
  
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(sortedRows, {
      header: ["SKU", "Description", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
    });
    const sheetName = folderName.substring(0, 31); // Sheet name max length
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    
    const wbout = XLSX.write(workbook, { bookType: 'xlsb', type: 'array', bookVBA: true });
    

    const blob = new Blob([wbout], { type: "application/octet-stream" });
  
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheetName.replace(/[^a-zA-Z0-9-_]/g, '_')}_Mapped.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloaded: ${sheetName}_Mapped.xlsx`);

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
    if (!data.length) return [];
  
    // Normalize the first row's keys
    const sampleRow = data[0];
    const normalizedHeaders = {};
    Object.keys(sampleRow).forEach(key => {
      const keyLower = key.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/gi, '');
      normalizedHeaders[keyLower] = key;
    });
  
    // Try to guess correct columns from flexible header names
    const colMap = {
      sku: normalizedHeaders["sku"] || normalizedHeaders["sku#"] || normalizedHeaders["skunumber"] || "",
      description: normalizedHeaders["description"] || "",
      uom: normalizedHeaders["uom"] || normalizedHeaders["unitofmeasure"] || "",
      folder: normalizedHeaders["folder"] || normalizedHeaders["elevation"] || "", // fallback if needed
      colorgroup: normalizedHeaders["colorgroup"] || "",
      vendor: normalizedHeaders["vendor"] || "",
      unitcost: normalizedHeaders["unitcost"] || normalizedHeaders["cost"] || "",
      qty: normalizedHeaders["qty"] || normalizedHeaders["quantity"] || ""
    };
  
    const result = {};
  
    data.forEach(row => {
      const sku = row[colMap.sku];
      const folder = row[colMap.folder];
      const qtyRaw = row[colMap.qty];
      const qty = parseFloat(qtyRaw) || 0;
  
      if (!sku || !folder) return;
  
      const key = `${sku}___${folder}`;
      if (!result[key]) {
        result[key] = {
          SKU: sku,
          Description: row[colMap.description] || "",
          UOM: row[colMap.uom] || "",
          Folder: folder,
          ColorGroup: row[colMap.colorgroup] || "",
          Vendor: row[colMap.vendor] || "",
          UnitCost: parseFloat(row[colMap.unitcost]) || 0,
          TotalQty: 0
        };
      }
  
      result[key].TotalQty += qty;
    });
  
    return Object.values(result);
  }
  
  function sendMergedDataToServer() {
    if (!mergedData.length) {
      alert("No merged data to send.");
      return;
    }
  
    console.log("📦 Sending merged data to server...");
    console.log("📊 Merged data sample:", mergedData.slice(0, 3)); // Preview first 3 rows
  
    const blob = new Blob([JSON.stringify(mergedData)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('data', blob, 'merged-data.json');
  
    fetch('http://localhost:3001/inject-xlsb', {
      method: 'POST',
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error(`❌ Failed with status ${res.status}`);
        return res.text();
      })
      .then(message => {
        try {
          console.log("✅ Server response message:", message);
          showToast(message || `✅ Injected folder: ${folder}`);
          enableDownloadButton();
          downloadInjectedXLSB(); // 👈 Auto-download after success
        } catch (displayError) {
          console.error("⚠️ Error while handling success:", displayError);
        }
      })
      
      .catch(err => {
        console.error("❌ Error during fetch to /inject-xlsb:", err);
        alert('❌ Something went wrong injecting into .xlsb');
      });
  }
  
  function downloadMergedDataAsJSON() {
    const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'merged-data.json';
    a.click();
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
  
      // Sort all rows by SKU first
      const sortedBySKU = [...allRows].sort((a, b) => {
        const skuA = (a.SKU || "").toLowerCase();
        const skuB = (b.SKU || "").toLowerCase();
        return skuA.localeCompare(skuB);
      });
  
      // Then move all "labor" SKUs to the bottom
      const nonLaborRows = sortedBySKU.filter(d => !/labor/i.test(d.SKU));
      const laborRows = sortedBySKU.filter(d => /labor/i.test(d.SKU));
      const finalSortedRows = [...nonLaborRows, ...laborRows];
  
      const tableId = `copyTable_${index}`;
      let tsvContent = `SKU\tDescription\tUOM\t\t\tQTY\tColor Group\n`;
  
      finalSortedRows.forEach(row => {
        tsvContent += `${row.SKU}\t${row.Description}\t\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
      });
  
      html += `<h3>${folder}</h3>
      <button onclick="copyToClipboard('${tableId}')">Copy Table to Clipboard</button>
      <textarea id="${tableId}" style="display:none;">${tsvContent.trim()}</textarea>
      <table><thead><tr>
        <th>SKU</th>
        <th>Description</th>
        <th>QTY</th>
        <th>Color Group</th>
      </tr></thead><tbody>`;
  
      finalSortedRows.forEach(row => {
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
    if (!container) return;
  
    container.innerHTML = '';
  
    const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
    if (!uniqueFolders.length) {
      container.innerHTML = '<p>No folders available yet.</p>';
      return;
    }
  
    uniqueFolders.forEach(folder => {
      const button = document.createElement('button');
      button.textContent = `Download "${folder}"`;
      button.style.margin = '6px';
      button.addEventListener('click', () => injectSelectedFolder(folder));
      container.appendChild(button);
    });
  }
  
  function injectSelectedFolder(folder) {
    const filteredData = mergedData.filter(d => d.Folder === folder);
    if (!filteredData.length) return alert(`No data for ${folder}`);
  
    const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_'); // sanitize filename
    const filename = `merged-data-${safeFolder}.json`;
    const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: 'application/json' });
  
    // 💾 Save the blob in memory for later
    window.currentJSONBlob = blob;
    window.currentJSONFilename = filename;
  
    // 👇 Offer bat file download directly
    offerPythonRunScript(filename);
  
    showToast(`✅ Prepared BAT for "${folder}"`);
  }
    
  document.getElementById('jsonUpload').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const json = JSON.parse(e.target.result);
        mergedData = json;
        displayMergedTable(mergedData);
        renderFolderButtons();
        showToast(`✅ Loaded JSON with ${mergedData.length} rows`);
  
        // 🔁 Automatically offer the .bat file to run the script
        offerPythonRunScript(file.name); // ✅ This line is correct
      } catch (err) {
        alert("❌ Failed to parse JSON file.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  });
  
  
  function enableDownloadButton() {
    document.getElementById("downloadButton").disabled = false;
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
    showToast(`Downloaded: ${sheetName}_Mapped.xlsx`);

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
  
  function downloadInjectedXLSB() {
    fetch('http://localhost:3001/download-xlsb')
      .then(res => {
        if (!res.ok) throw new Error("❌ Failed to fetch XLSB file");
        return res.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "Updated_Macro_Template.xlsb";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("✅ Downloaded Updated_Macro_Template.xlsb");
      })
      .catch(err => {
        console.error(err);
        alert("❌ Failed to download XLSB file");
      });
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
  showToast("Mapped workbook downloaded.");

}
document.getElementById("downloadAllBtn").addEventListener("click", function () {
  const files = [
    {
      name: "inject-xlsb.exe",
      url: "https://github.com/RichardMCGirt/estimatingrawexport/releases/download/v1.0/inject-xlsb.exe"
    },
    {
      name: "plan.xlsb",
      url: "https://github.com/RichardMCGirt/estimatingrawexport/releases/download/v1.0/plan.xlsb"
    }
  ];

  function triggerDownload(index) {
    if (index >= files.length) return;

    const file = files[index];
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => triggerDownload(index + 1), 1000); // ⏱ 1 second delay
  }

  triggerDownload(0);
});


function offerPythonRunScript(jsonFilename) {
  const baseName = jsonFilename.replace(/\.json$/i, '');
  const exeName = 'inject-xlsb.exe';

  const batContent = `@echo off
echo Running ${exeName} using "${jsonFilename}"
if not exist ${exeName} (
  echo ERROR: ${exeName} NOT FOUND in this folder: %CD%
  echo Please copy ${exeName} here and try again.
  pause
  exit /b 1
)
${exeName} "${jsonFilename}"
pause
`;

  // 🔽 Download BAT file
  const batBlob = new Blob([batContent], { type: 'application/octet-stream' });
  const batLink = document.createElement("a");
  batLink.href = URL.createObjectURL(batBlob);
  batLink.download = `run_inject_${baseName}.bat`;
  document.body.appendChild(batLink);
  batLink.click();
  document.body.removeChild(batLink);

  // 🔽 Download JSON file
  if (window.currentJSONBlob) {
    const jsonLink = document.createElement("a");
    jsonLink.href = URL.createObjectURL(window.currentJSONBlob);
    jsonLink.download = jsonFilename;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
  }

  showToast(`✅ .bat and .json files for "${jsonFilename}" downloaded`);

  setTimeout(() => {
    alert(`ℹ️ Your files are ready.\n\n1. Open your Downloads folder\n2. Double-click "run_inject_${baseName}.bat"\n\n A blue screen will appear click more info then run any way\n\n Make sure 'inject-xlsb.exe' and 'plan.xlsb' are in the Download folder.`);
  }, 500);
}




