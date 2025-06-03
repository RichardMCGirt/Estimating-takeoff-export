let mergedData = [];
let mappedWorkbook = null;
let rawSheetData = []; // 👈 global to store unmerged data

const defaultServer = "https://fdb2-174-108-187-19.ngrok-free.app/inject";
const savedServer = localStorage.getItem("injectionServerURL");
const serverURL = savedServer || defaultServer;

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

    rawSheetData = json; // ✅ save raw unmerged data
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
uom: getHeaderMatch(["uom", "unitofmeasure", "units", "uomlf", "uom(lf)", "uom_"], normalizedHeaders),
      folder: getHeaderMatch(["folder", "elevation"], normalizedHeaders),
      colorgroup: getHeaderMatch(["colorgroup", "color"], normalizedHeaders),
      vendor: getHeaderMatch(["vendor"], normalizedHeaders),
      unitcost: getHeaderMatch(["unitcost", "cost"], normalizedHeaders),
      qty: getHeaderMatch(["qty", "quantity"], normalizedHeaders),
      
    };
    
    console.log("✅ colMap.description2 points to:", colMap.description2);
    console.log("✅ Final colMap.description2 =", colMap.description2);

    console.log("📌 Mapped Columns:", colMap);
  console.log("✅ Final colMap.uom =", colMap.uom);

    const result = {};
  
   data.forEach((row, i) => {
  const sku = row[colMap.sku]?.trim();
  const folder = row[colMap.folder]?.trim();

  if (!sku || !folder) {
    console.warn(`❌ Skipping row with missing SKU or folder:`, row);
    return;
  }

  console.log(`🧪 SKU ${sku} is in folder "${folder}"`);

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
  
return Object.values(result).map(item => {
  if (!Number.isInteger(item.TotalQty)) {
    item.TotalQty = Math.ceil(item.TotalQty);
  }
  return item;
});
  }
  
  function displayMergedTable(data) {
  const container = document.getElementById("mergedTableContainer");
  const wrapper = document.getElementById("mergedTableWrapper");

  if (!data.length) {
    container.innerHTML = "<p>No merged data found.</p>";
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  const folders = [...new Set(data.map(d => d.Folder))];
  let html = "";

  folders.forEach((folder, index) => {
    const allRows = data.filter(d => d.Folder === folder);

    // ⛔️ Filter OUT labor rows
    const filteredRows = allRows.filter(d => !/labor/i.test(d.SKU));

    if (!filteredRows.length) return; // Skip rendering this folder if only labor rows exist

    // Sort by SKU
    const sortedRows = filteredRows.sort((a, b) => {
      const skuA = (a.SKU || "").toLowerCase();
      const skuB = (b.SKU || "").toLowerCase();
      return skuA.localeCompare(skuB);
    });

    const tableId = `copyTable_${index}`;
    let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;

    sortedRows.forEach(row => {
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

    sortedRows.forEach(row => {
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

  const dataForInjection = filteredData.filter(d => !/labor/i.test(d.SKU)); // 💡 remove labor SKUs

  if (!dataForInjection.length) return alert(`No non-labor data to inject for ${folder}`);

  const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `merged-data-${safeFolder}.json`;
  const blob = new Blob([JSON.stringify(dataForInjection, null, 2)], { type: 'application/json' });

  // Save full JSON blob (in case user wants to download later)
  window.currentJSONBlob = blob;
  window.currentJSONFilename = filename;

  // 🚀 Inject only non-labor data
  sendToInjectionServer(dataForInjection, folder);

  showToast(`✅ Injected "${folder}" to server (labor rows excluded)`);
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

function injectSelectedFolder(folder) {
  const filteredData = mergedData.filter(d => d.Folder === folder);
  if (!filteredData.length) return alert(`No data for ${folder}`);

  const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `merged-data-${safeFolder}.json`;
  const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: 'application/json' });

  // 💾 Save full JSON in case user downloads later
  window.currentJSONBlob = blob;
  window.currentJSONFilename = filename;

  // ✅ Send FULL version to the server (not slimmed)
  sendToInjectionServer(filteredData, folder);

  showToast(`✅ Injected "${folder}" to server`);
}


function sendToInjectionServer(data, folderName) {
  const serverURL = "https://8bd0-174-108-187-19.ngrok-free.app/inject";

  const payload = {
    data: data,                // mergedData (filtered by folder)
    raw: rawSheetData,         // original raw XLSX rows
    type: "elevation"
  };

  console.log("📤 Sending payload:", payload);

  fetch(serverURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      return response.blob();
    })
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${folderName}.xlsb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("✅ File downloaded.");
    })
    .catch(error => {
      console.error("Download failed", error);
      alert("❌ Injection failed.");
    });
}



