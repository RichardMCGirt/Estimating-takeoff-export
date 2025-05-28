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
      header: ["SKU", "Description", "Description 2", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
    });
    const sheetName = folderName.substring(0, 31); // Sheet name max length
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    
    const wbout = XLSX.write(workbook, { bookType: 'xlsb', type: 'array', bookVBA: true });
    

    const blob = new Blob([wbout], { type: "application/octet-stream" });
  
    const a = document.createElement("a");
a.href = `${file.url}?t=${Date.now()}`; // prevents browser caching
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
          header: ["SKU", "Description", "Description 2", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
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
  
    const sampleRow = data[0];
    const normalizedHeaders = {};
    Object.keys(sampleRow).forEach(key => {
      const keyLower = key.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
      normalizedHeaders[keyLower] = key;
    });
  
    console.log("🔍 Normalized Headers:", normalizedHeaders);
    function getHeaderMatch(possibleNames, normalizedHeaders) {
      const normalizedKeys = Object.keys(normalizedHeaders);
      for (const name of possibleNames) {
        const match = normalizedKeys.find(k => k.includes(name));
        if (match) return normalizedHeaders[match];
      }
      return "";
    }
    
    const colMap = {
      sku: getHeaderMatch(["sku", "sku#", "skunumber"], normalizedHeaders),
      description: getHeaderMatch(["description"], normalizedHeaders),
      description2: getHeaderMatch(["description2", "desc2"], normalizedHeaders),
      uom: getHeaderMatch(["uom", "unitofmeasure", "units"], normalizedHeaders),
      folder: getHeaderMatch(["folder", "elevation"], normalizedHeaders),
      colorgroup: getHeaderMatch(["colorgroup", "color"], normalizedHeaders),
      vendor: getHeaderMatch(["vendor"], normalizedHeaders),
      unitcost: getHeaderMatch(["unitcost", "cost"], normalizedHeaders),
      qty: getHeaderMatch(["qty", "quantity"], normalizedHeaders),
    };
    
    console.log("📌 Mapped Columns:", colMap);
    
    console.log("✅ colMap.description2 points to:", colMap.description2);
    console.log("✅ Final colMap.description2 =", colMap.description2);

    console.log("📌 Mapped Columns:", colMap);
  
    const result = {};
  
    data.forEach((row, i) => {
      const sku = row[colMap.sku];
      const folder = row[colMap.folder];
      const qtyRaw = row[colMap.qty];
      const qty = parseFloat(qtyRaw) || 0;
  
      if (i < 3) {
        console.log(`🧪 Row ${i + 1}:`);
        console.log(`   SKU: ${sku}`);
        console.log(`   Description: ${row[colMap.description]}`);
        console.log(`   Description2: ${row[colMap.description2]}`);
      }
  
      if (!sku || !folder) return;
  
      const key = `${sku}___${folder}`;
      if (!result[key]) {
        result[key] = {
          SKU: sku,
          Description: row[colMap.description] || "",
          Description2: row[colMap.description2] || "",
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
  
   
  function downloadMergedDataAsJSON() {
    const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'merged-data.json';
    a.click();
  }
  
  function displayMergedTable(data) {
    const container = document.getElementById("mergedTableContainer");
    const wrapper = document.getElementById("mergedTableWrapper");
  
    if (!data.length) {
      container.innerHTML = "<p>No merged data found.</p>";
      wrapper.style.display = "none"; // Hide again if data is cleared
      return;
    }
  
    // Show the wrapper only if data is valid
    wrapper.style.display = "block";
  
    const folders = [...new Set(data.map(d => d.Folder))];
    let html = "";
  
    folders.forEach((folder, index) => {
      const allRows = data.filter(d => d.Folder === folder);
  
      // Sort by SKU first
      const sortedBySKU = [...allRows].sort((a, b) => {
        const skuA = (a.SKU || "").toLowerCase();
        const skuB = (b.SKU || "").toLowerCase();
        return skuA.localeCompare(skuB);
      });
  
      // Move labor rows to the bottom
      const nonLaborRows = sortedBySKU.filter(d => !/labor/i.test(d.SKU));
      const laborRows = sortedBySKU.filter(d => /labor/i.test(d.SKU));
      const finalSortedRows = [...nonLaborRows, ...laborRows];
  
      const tableId = `copyTable_${index}`;
      let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;
  
      finalSortedRows.forEach(row => {
        tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
      });
  
      html += `<h3>${folder}</h3>
      <button onclick="copyToClipboard('${tableId}')">Copy Table to Clipboard</button>
      <textarea id="${tableId}" style="display:none;">${tsvContent.trim()}</textarea>
      <table style="width:100%; text-align:center; border-collapse: collapse;"><thead><tr>
        <th style="text-align:center;">SKU</th>
        <th style="text-align:center;">Description</th>
<th style="text-align:center;">Description 2</th>

        <th style="text-align:center;">QTY</th>
        <th style="text-align:center;">Color Group</th>
      </tr></thead><tbody>`;
  
      finalSortedRows.forEach(row => {
        html += `<tr>
          <td style="text-align:center;">${row.SKU}</td>
          <td style="text-align:center;">${row.Description}</td>
<td style="text-align:center;">${row.Description2 || ""}</td>

          <td style="text-align:center;">${row.TotalQty.toFixed(2)}</td>
          <td style="text-align:center;">${row.ColorGroup}</td>
        </tr>`;
      });
  
      html += `</tbody></table><br/>`;
    });
  
    container.innerHTML = html;
  }
  
  
  

  function renderFolderButtons() {
    const container = document.getElementById('folderButtons');
    const section = document.getElementById('elevationSection');
    if (!container || !section) return;
  
    container.innerHTML = '';
  
    const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
    if (!uniqueFolders.length) {
      section.style.display = "none"; // 🔒 hide if no folders
      return;
    }
  
    section.style.display = "block"; // ✅ show section once folders exist
  
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

  // 💡 Show toast + trigger BAT + JSON downloads
  offerPythonRunScript(filename);
// createOpenLatestBat();
  showToast(`✅ Downloaded files for "${folder}"`);
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
      header: ["SKU", "Description", "Description2", "UOM", "Folder", "ColorGroup", "Vendor", "UnitCost", "TotalQty"]
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

function offerPythonRunScript(jsonFilename) {
  const baseName = jsonFilename.replace(/\.json$/i, '');

const batContent = `@echo off
cd %USERPROFILE%\\Downloads

:: Check for required files
if not exist "inject-xlsb-v1.1.exe" (
  echo ❌ inject-xlsb-v1.1.exe not found in Downloads. Please download it first.
  pause
  exit /b
)
if not exist "plan.xlsb" (
  echo ❌ plan.xlsb not found in Downloads. Please download it first.
  pause
  exit /b
)
if not exist "merged-data-${baseName}.json" (
  echo ❌ merged-data-${baseName}.json not found.
  pause
  exit /b
)

echo ✅ All required files found. Running injector...
start /wait "" "inject-xlsb-v1.1.exe" "merged-data-${baseName}.json"

echo 🔍 Looking for most recent .xlsb file in downloads folder...
for /f "delims=" %%F in ('powershell -NoProfile -Command "Get-ChildItem -Path ''%USERPROFILE%\Downloads\downloads'' -Filter ''*.xlsb'' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }"') do (
  echo 📂 Opening: %%~nxF
  start "" "%%F"
  goto done
)


echo ❌ Could not find any Vanir_Takeoff_*.xlsb file.
pause
goto end

:done
echo ✅ File opened. Press any key to exit...
pause
:end
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
    jsonLink.download = `merged-data-${baseName}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
  }

  showToast(`✅ .bat and .json files for "${baseName}" downloaded`);

  setTimeout(() => {
    alert(`📁 Files ready!\n\nInsure the following are in your Downloads folder:\n- inject-xlsb-v1.1.exe\n- plan.xlsb\n- merged-data-${baseName}.json\n\nThen double-click run_inject_${baseName}.bat to run the injection.`);
  }, 500);
}
// cd %USERPROFILE%\\Downloads

// :: Define download URLs
// set "EXE_URL=https://v5.airtableusercontent.com/v3/u/41/41/1748368800000/x0jrawyAjBgmuxS4Hw6mWw/nJzh3WrB9q9xFhIQ5_976bm5-ElfG3EQI051TWLbxu5tTT1hZO4NGBtn2COF5b1Q0nvD87tzbqT5P7JQpFLMQMDm4_czsvT6xY77PTZqN3ujSZGWnhqcJo7AFKs9FRn7lKO_d2MkIDst38iPmRYw2AJz70WHobqq4x8824ykV1k/yvKRQz-tqHAzlaGjWnJZiEHcpxWWqTpbkLsUgZhqb5Q"

// set "PLAN_URL=https://v5.airtableusercontent.com/v3/u/41/41/1748368800000/8Xby7sIwtA-YplCUI5ejhQ/kiHSWaGpHM7sARULbQNjuuSvosRZ7_12QRcJ-kQldUa-X_vC8vIvtJnd8hClSP4l6DVtY9y8qPgDOYYYAUQDcHd7wKWob0fIx50LhjQIdCgixDzDGYGrjfDrjcJffEnamMw3qqY7hNeTxUFVgrHmsA/ClUSsz04wR6jLPwVexfjlfoueVL_E1BmhVRCJil0CwY
// "

// :: Download inject-xlsb-v1.1.exe if missing
// if not exist "inject-xlsb-v1.1.exe" (
   //echo ⬇️ inject-xlsb-v1.1.exe not found. Downloading...
  // powershell -Command "Invoke-WebRequest -Uri '%EXE_URL%' -OutFile 'inject-xlsb-v1.1.exe'"
//)

// :: Download plan.xlsb if missing
//if not exist "plan.xlsb" (
 // echo ⬇️ plan.xlsb not found. Downloading...
  //powershell -Command "Invoke-WebRequest -Uri '%PLAN_URL%' -OutFile 'plan.xlsb'"
//)
function createOpenLatestBat() {
  const batContent = `@echo off
cd %USERPROFILE%\\Downloads

echo 🔍 Looking for most recent Vanir_Takeoff .xlsb file...

for /f "usebackq delims=" %%F in (\`powershell -NoProfile -Command "Get-ChildItem -Path . -Filter '*Vanir_Takeoff*.xlsb' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { $_.FullName }"\`) do (
  echo 📂 Opening: %%~nxF
  start "" "%%F"
)

pause`;

  const blob = new Blob([batContent], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "open_latest_output.bat";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


async function fetchFilesFromAirtable() {
  const airtableApiKey = 'patTGK9HVgF4n1zqK.cbc0a103ecf709818f4cd9a37e18ff5f68c7c17f893085497663b12f2c600054';
  const baseId = 'appC66GdZvBlr76Bv';
  const tableName = 'tblEvTgj6oyT0YNi3';
  const targetRecordId = 'recFowFd2V7QHUZao';

  const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;
  console.log("📡 Fetching files from Airtable...");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${airtableApiKey}`,
    }
  });

  const data = await response.json();
  console.log("✅ Airtable response:", data);

  const record = data.records.find(r => r.id === targetRecordId);
  if (!record) {
    console.error(`❌ Record with ID ${targetRecordId} not found.`);
    return;
  }

  const attachments = record.fields["Estimating files"];
  if (!attachments || !attachments.length) {
    console.warn("⚠️ No attachments found in field: Estimating files");
    alert("No files found in Airtable.");
    return;
  }

  console.log(`📦 Found ${attachments.length} files:`);
  attachments.forEach((file, i) => {
    console.log(`#${i + 1}:`, {
      filename: file.filename,
      type: file.type,
      sizeKB: Math.round(file.size / 1024),
      url: file.url
    });
  });

 for (const file of attachments) {
  console.log(`🔄 Fetching: ${file.filename}`);
  const fileResponse = await fetch(file.url);
  const blob = await fileResponse.blob();
  window[`fileBlob_${file.filename}`] = blob;

  const filename = file.filename; // e.g., "plan.xlsb" or "inject-xlsb-v1.1.exe"
  const baseName = filename.replace(/\.[^/.]+$/, ''); // strip file extension

  const storageKey = `downloaded_${filename}`;
  if (!localStorage.getItem(storageKey)) {
    forceDownloadBlob(blob, filename);
    localStorage.setItem(storageKey, "true");
    console.log(`⬇️ Downloaded ${filename}`);
  } else {
    console.log(`⏩ Skipped ${filename} (already downloaded)`);
  }

  // ✅ Safe to use baseName now
  if (!localStorage.getItem(`generatedFiles_${baseName}`)) {
    console.log(`🛠️ Generating assets for: ${baseName}`);
    // generate assets for baseName if needed...
    localStorage.setItem(`generatedFiles_${baseName}`, "true");
  } else {
    console.log(`⏩ Skipping .bat/.json generation for ${baseName}`);
  }
}

  showToast("✅ Files loaded and downloaded (no duplicates)");
}



window.addEventListener("DOMContentLoaded", fetchFilesFromAirtable);

function forceDownloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    console.error(`❌ Cannot download "${filename}". Blob is invalid:`, blob);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

showToast("✅ Files saved to Downloads");
  const fileLinks = [
    {
      name: "inject-xlsb-v1.1.exe",
      url: "https://v5.airtableusercontent.com/v3/u/41/41/1748368800000/x0jrawyAjBgmuxS4Hw6mWw/nJzh3WrB9q9xFhIQ5_976bm5-ElfG3EQI051TWLbxu5tTT1hZO4NGBtn2COF5b1Q0nvD87tzbqT5P7JQpFLMQMDm4_czsvT6xY77PTZqN3ujSZGWnhqcJo7AFKs9FRn7lKO_d2MkIDst38iPmRYw2AJz70WHobqq4x8824ykV1k/yvKRQz-tqHAzlaGjWnJZiEHcpxWWqTpbkLsUgZhqb5Q"
    },
    {
      name: "plan.xlsb",
      url: "https://v5.airtableusercontent.com/v3/u/41/41/1748368800000/8Xby7sIwtA-YplCUI5ejhQ/kiHSWaGpHM7sARULbQNjuuSvosRZ7_12QRcJ-kQldUa-X_vC8vIvtJnd8hClSP4l6DVtY9y8qPgDOYYYAUQDcHd7wKWob0fIx50LhjQIdCgixDzDGYGrjfDrjcJffEnamMw3qqY7hNeTxUFVgrHmsA/ClUSsz04wR6jLPwVexfjlfoueVL_E1BmhVRCJil0CwY"
    }
  ];

  async function downloadFiles() {
    for (const file of fileLinks) {
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = file.name;
        link.click();
        console.log(`✅ Downloaded: ${file.name}`);
      } catch (err) {
        console.error(`❌ Failed to download ${file.name}`, err);
        alert(`Failed to download ${file.name}`);
      }
    }
  }

  document.getElementById("downloadAllBtn").addEventListener("click", downloadFiles);