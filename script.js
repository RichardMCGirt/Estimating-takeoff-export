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
renderMaterialBreakoutButtons();
  };
  reader.readAsArrayBuffer(file);
}

function injectMaterialBreakout() {
  if (!mergedData.length) {
    alert("No merged data found.");
    return;
  }

  sendToInjectionServer(mergedData, "Material_Break_Out", "material_breakout");
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
    return;
  }

  const key = `${sku}___${folder}`;

  // 🔍 Focused log for zLABORCEIL
  if (sku.toLowerCase() === "zlaborceil") {
    console.log(`🧪 [zLABORCEIL] Row ${i + 1}:`, {
      Folder: folder,
      Key: key,
      Description: row[colMap.description],
      Qty: row[colMap.qty]
    });
  }

  const qtyRaw = row[colMap.qty];
  const qty = parseFloat(qtyRaw) || 0;

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

const merged = Object.values(result).map(item => {
  const isLabor = item.SKU?.toLowerCase().includes("labor");
  const uom = item.UOM?.trim().toUpperCase();

  // ✅ Skip rounding if it's labor OR UOM is SQ
  const skipRounding = isLabor || uom === "SQ";

  if (!skipRounding && !Number.isInteger(item.TotalQty)) {
    item.TotalQty = Math.ceil(item.TotalQty); // ⛔ Only round if not labor and not SQ
  }

  return item;
});

return merged;

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

  // Separate non-labor and labor rows
  const nonLaborRows = allRows.filter(d => !/labor/i.test(d.SKU));
  const laborRows = allRows.filter(d => /labor/i.test(d.SKU));

  if (!nonLaborRows.length && !laborRows.length) return; // skip empty folders

  const sortedNonLabor = nonLaborRows.sort((a, b) => (a.SKU || "").localeCompare(b.SKU || ""));
  const sortedLabor = laborRows.sort((a, b) => (a.SKU || "").localeCompare(b.SKU || ""));

  const tableId = `copyTable_${index}`;
  let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;

  html += `<h3>${folder}</h3>
  <button onclick="copyToClipboard('${tableId}')">Copy Table to Clipboard</button>
  <textarea id="${tableId}" style="display:none;">`;

  // Append non-labor to TSV + HTML
  sortedNonLabor.forEach(row => {
    tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
  });

  // Spacer lines
  if (sortedLabor.length) {
    tsvContent += `\n\n`; // add 2 blank lines to TSV
  }

  // Append labor to TSV
  sortedLabor.forEach(row => {
    tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
  });

  html += `${tsvContent.trim()}</textarea>
  <table style="width:100%; text-align:center; border-collapse: collapse;">
   <thead><tr>
  <th style="text-align:center;">SKU</th>
  <th style="text-align:center;">Description</th>
  <th style="text-align:center;">Description 2</th>
  <th style="text-align:center;">UOM</th> <!-- ✅ added -->
  <th style="text-align:center;">QTY</th>
  <th style="text-align:center;">Color Group</th>
</tr></thead>

<tbody>`;

  // Render non-labor
 sortedNonLabor.forEach(row => {
  html += `<tr>
  <td style="text-align:center;">${row.SKU}</td>
  <td style="text-align:center;">${row.Description}</td>
  <td style="text-align:center;">${row.Description2 || ""}</td>
  <td style="text-align:center;">${row.UOM}</td> <!-- ✅ added -->
  <td style="text-align:center;" title="Pre-rounded: ${row.TotalQty}">${row.TotalQty.toFixed(2)}</td>
  <td style="text-align:center;">${row.ColorGroup}</td>
</tr>`;
});


  // Spacer rows
  if (sortedLabor.length) {
    html += `<tr><td colspan="5" style="height:10px;"></td></tr>`;
    html += `<tr><td colspan="5" style="height:10px;"></td></tr>`;
  }

  // Render labor
  sortedLabor.forEach(row => {
  html += `<tr>
  <td style="text-align:center;">${row.SKU}</td>
  <td style="text-align:center;">${row.Description}</td>
  <td style="text-align:center;">${row.Description2 || ""}</td>
  <td style="text-align:center;">${row.UOM}</td> <!-- ✅ added -->
  <td style="text-align:center;" title="Pre-rounded: ${row.TotalQty}">${row.TotalQty.toFixed(2)}</td>
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
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  uniqueFolders.forEach(folder => {
    const button = document.createElement('button');
    button.textContent = `${folder}`;
    button.style.margin = '6px';
    button.classList.add("folder-button");

button.addEventListener('click', async () => {
  button.disabled = true;
  button.textContent = `Injecting "${folder}"...`;

  showLoadingOverlay(true, `📦 Generating and downloading "${folder}"...`); // ✅ Add this early

  try {
    const elevationData = mergedData.filter(d => d.Folder === folder);
    const breakoutMerged = mergeForMaterialBreakout(elevationData);

    if (!elevationData.length) return alert(`No elevation data for "${folder}"`);
    if (!breakoutMerged.length) return alert(`No breakout data for "${folder}"`);

    await sendToInjectionServerDualSheet(elevationData, breakoutMerged, folder);
  } catch (err) {
    console.error("❌ Injection error:", err);
    alert(`Injection failed for ${folder}`);
  } finally {
    button.disabled = false;
    button.textContent = folder;
    showToast(`✅ ${folder} Chosen`);
    showLoadingOverlay(false); // ✅ Hide when done
  }
});

    container.appendChild(button);
  });
}
function showLoadingOverlay(show = true, message = "Processing...") {
  const overlay = document.getElementById("loadingOverlay");
  const messageElement = document.getElementById("loadingMessage");

  if (!overlay) {
    console.warn("⚠️ loadingOverlay element not found.");
    return;
  }

  if (show) {
    overlay.style.display = "flex";
    if (messageElement) {
      messageElement.textContent = message;
      console.log(`🔔 Overlay shown with message: "${message}"`);
    } else {
      console.warn("⚠️ loadingMessage element not found.");
    }
  } else {
    overlay.style.display = "none";
    console.log("✅ Overlay hidden.");
  }
}

// Utility function to disable/enable all folder buttons
function disableAllFolderButtons(disabled, message = "") {
  const buttons = document.querySelectorAll('.folder-button');
  buttons.forEach(btn => {
    btn.disabled = disabled;
    btn.textContent = disabled ? message : btn.getAttribute("data-original-label") || btn.textContent;
    if (!btn.getAttribute("data-original-label")) {
      btn.setAttribute("data-original-label", btn.textContent);
    }
  });
}

function sendToInjectionServerDualSheet(elevationData, breakoutData, folderName) {
  const serverURL = "https://76ea-174-108-187-19.ngrok-free.app/inject";

  const payload = {
    data: elevationData,
    breakout: breakoutData,
    type: "combined"
  };

  console.log("📤 Sending combined payload:", payload);

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
      showToast("✅ Combined workbook downloaded.");

      // ⏳ Keep overlay a little longer for user to notice
      setTimeout(() => {
        showLoadingOverlay(false);
      }, 1500); // 1.5 second delay
    })
    .catch(error => {
      console.error("Download failed", error);
      alert("❌ Combined injection failed.");
      showLoadingOverlay(false);
    });
  }

  
function injectSelectedFolder(folder) {
  const filteredData = mergedData.filter(d => d.Folder === folder);
  if (!filteredData.length) return alert(`No data for ${folder}`);

  const safeFolder = folder.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `merged-data-${safeFolder}.json`;
  const blob = new Blob([JSON.stringify(filteredData, null, 2)], { type: 'application/json' });

  // Save full JSON in case user wants to download
  window.currentJSONBlob = blob;
  window.currentJSONFilename = filename;

  // Auto-decide type: "material_breakout" if folder name includes breakout, else "elevation"
const isBreakout = /break\s*out/i.test(folder) || folder.toLowerCase() === "screen porch";
  const injectionType = isBreakout ? "material_breakout" : "elevation";

  const nonLabor = filteredData.filter(d => !/labor/i.test(d.SKU));
  if (!nonLabor.length && !isBreakout) return alert(`No non-labor data to inject for ${folder}`);

  sendToInjectionServer(
    isBreakout ? filteredData : nonLabor,
    folder,
    injectionType
  );

  showToast(`✅ Injected "${folder}" to server (${injectionType})`);
}
function renderMaterialBreakoutButtons() {
  const section = document.getElementById("materialBreakoutSection");
  const container = document.getElementById("materialBreakoutButtons");
  if (!section || !container) return;

  container.innerHTML = '';

  const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
  if (!uniqueFolders.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  uniqueFolders.forEach(folder => {
    const button = document.createElement('button');
    button.textContent = `Download "${folder}"`;
    button.style.margin = '6px';
    button.addEventListener('click', () => {
const folderRows = mergedData.filter(d => 
  d.Folder === folder && !/labor/i.test(d.SKU)
);
const breakoutMerged = mergeForMaterialBreakout(folderRows);

if (!breakoutMerged.length) return alert(`No data for ${folder}`);
sendToInjectionServer(breakoutMerged, folder, "material_breakout");
      showToast(`✅ Injected "${folder}" to Material Break Out`);
    });
    container.appendChild(button);
  });
}

function mergeForMaterialBreakout(data) {
  const result = {};

  data.forEach(row => {
    const sku = row.SKU?.trim();
    const colorGroup = row.ColorGroup?.trim();

if (!sku || !colorGroup) return;

    const key = `${sku}___${colorGroup}`;
    if (!result[key]) {
      result[key] = {
        ...row,
        TotalQty: 0
      };
    }

    result[key].TotalQty += parseFloat(row.TotalQty) || 0;
  });

  // Round up TotalQty
const merged = Object.values(result).map(item => {
  const isLabor = item.SKU?.toLowerCase().includes("labor");

  // 🔍 Log original value
  if (item.SKU?.toLowerCase() === "zlaborceil") {
    console.log(`🔍 Before rounding [${item.Folder}]: ${item.SKU} -> ${item.TotalQty}`);
  }

  if (!isLabor && !Number.isInteger(item.TotalQty)) {
    item.TotalQty = Math.ceil(item.TotalQty);
  }

  // 🔍 Log after rounding decision
  if (item.SKU?.toLowerCase() === "zlaborceil") {
    console.log(`✅ Final value [${item.Folder}]: ${item.SKU} -> ${item.TotalQty}`);
  }

  return item;
});

console.table(merged.filter(r => r.SKU?.toLowerCase() === "zlaborceil"));
return merged;

} // ✅ <- this was missing!

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

function sendToInjectionServer(data, folderName, type = "elevation") {
  const serverURL = "https://76ea-174-108-187-19.ngrok-free.app/inject";

 const payload = {
  data,
  type
};

if (type !== "material_breakout") {
  payload.raw = rawSheetData;
}

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
  showToast("✅ Download complete.");

  // Delay hiding to ensure user sees the message
  setTimeout(() => showLoadingOverlay(false), 1500);
});
}

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('sourceFile');
  const clickableText = document.querySelector('.click-browse');

  if (clickableText && fileInput) {
    clickableText.addEventListener('click', (e) => {
      e.stopPropagation(); // prevent event bubbling to dropZone
      fileInput.click();
    });
  }

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }
});




