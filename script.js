let mergedData = [];
let mappedWorkbook = null;
let rawSheetData = []; // 👈 global to store unmerged data

const defaultServer = "  https://ceda-174-108-187-19.ngrok-free.app/inject";
const savedServer = localStorage.getItem("injectionServerURL");
const serverURL = savedServer || defaultServer;

document.getElementById('sourceFile').addEventListener('change', handleSourceUpload);

function getFormMetadata() {
  const fields = ["builder", "planName", "elevation", "materialType", "date", "estimator"];
  const metadata = {};

  fields.forEach(field => {
    const input = document.querySelector(`[name="${field}"]`);
    metadata[field] = input?.value.trim() || "";
  });

  // 🧪 Debug logs
  console.log("📦 Metadata from input fields:");
  console.table(metadata);

  return metadata;
}

function handleSourceUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
document.getElementById('file-name').textContent = `📄 File selected: ${file.name}`;

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

function showToast(message = "Success!", durationMs = 4000) {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.warn("⚠️ Toast element not found.");
    return;
  }

  toast.textContent = message;
  toast.style.visibility = "visible";
  toast.style.opacity = "1";
  toast.style.bottom = "50%"; 

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.bottom = "30px";
    setTimeout(() => {
      toast.style.visibility = "hidden";
    }, 300);
  }, durationMs);
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
    const normalizedName = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
    const exactMatch = normalizedKeys.find(k => k === normalizedName);
    if (exactMatch) return normalizedHeaders[exactMatch];

    const partialMatch = normalizedKeys.find(k => k.includes(normalizedName));
    if (partialMatch) return normalizedHeaders[partialMatch];
  }

  return "";
}

    console.log("📋 Raw headers:", Object.keys(data[0]));

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
    
    const result = {};
  
  data.forEach((row, i) => {
  const sku = row[colMap.sku]?.trim();
  const folder = row[colMap.folder]?.trim();

  if (!sku || !folder) {
    return;
  }

  const key = `${sku}___${folder}`;

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
  const qty = item.TotalQty;
  item.TotalQty = qty > 0 ? Math.ceil(qty) : Math.floor(qty); // ✅ Rounds away from zero
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

  if (!nonLaborRows.length && !laborRows.length) return; 

  const sortedNonLabor = nonLaborRows.sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
const sortedLabor = laborRows.sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));


  const tableId = `copyTable_${index}`;
  let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;

  html += `<h3>${folder}</h3>
  <button onclick="copyToClipboard('${tableId}')">Copy ${folder} to Clipboard</button>
  <textarea id="${tableId}" style="display:none;">`;

  // Append non-labor to TSV + HTML
  sortedNonLabor.forEach(row => {
    tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${row.TotalQty.toFixed(2)}\t${row.ColorGroup}\n`;
  });

  // Spacer lines
  if (sortedLabor.length) {
    tsvContent += `\n\n`; 
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


// Spacer rows with full 6-column bordered layout
if (sortedLabor.length) {
  html += `
    <tr>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
    </tr>
    <tr>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
      <td style="height:10px; border: 1px solid #ccc;">&nbsp;</td>
    </tr>
  `;
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

function normalizeRawRow(row) {
  const normalizedKeys = {};
  Object.keys(row).forEach(key => {
    const keyNorm = key.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
    normalizedKeys[keyNorm] = key;
  });

  const getValue = (aliases) => {
    for (let alias of aliases) {
      const norm = alias.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
      if (normalizedKeys[norm]) return row[normalizedKeys[norm]];
    }
    return "";
  };

  return {
    SKU: getValue(["sku", "sku#", "skunumber"]),
    Description: getValue(["description"]),
    Description2: getValue(["description2", "desc2"]),
    UOM: getValue(["uom", "unitofmeasure", "units", "uomlf", "uom(lf)", "uom_"]),
    TotalQty: parseFloat(getValue(["qty", "quantity"])) || 0,
    ColorGroup: getValue(["colorgroup", "color"]),
    Folder: getValue(["folder", "elevation"]),
    Vendor: getValue(["vendor"]),
    UnitCost: parseFloat(getValue(["unitcost", "cost"])) || 0,
  };
}


function renderFolderButtons() {
  const container = document.getElementById('folderButtons');
  const section = document.getElementById('elevationSection');
  if (!container || !section) return;

  container.innerHTML = '';

  // ✅ Select All button
  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = "Select All";
  selectAllBtn.style.marginBottom = '12px';
  selectAllBtn.style.marginRight = '12px';

  let allSelected = false;
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.folder-checkbox');
    allSelected = !allSelected;
    checkboxes.forEach(cb => cb.checked = allSelected);
    selectAllBtn.textContent = allSelected ? "Deselect All" : "Select All";
  });

  container.appendChild(selectAllBtn);

  // ✅ Folder checkboxes row
  const checkboxRow = document.createElement('div');
  checkboxRow.id = 'folderCheckboxRow';
  checkboxRow.style.display = 'flex';
  checkboxRow.style.flexWrap = 'wrap';
  checkboxRow.style.gap = '12px';
  checkboxRow.style.marginBottom = '12px';
  container.appendChild(checkboxRow);

  const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
  if (!uniqueFolders.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  uniqueFolders.forEach(folder => {
    const label = document.createElement('label');
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.padding = '6px 12px';
    label.style.border = '1px solid #ccc';
    label.style.borderRadius = '6px';
    label.style.background = '#f9f9f9';
    label.style.cursor = 'pointer';
label.style.fontSize = '24px'; // ✅ Larger font size

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = folder;
    checkbox.classList.add('folder-checkbox');
    checkbox.style.marginRight = '8px';
checkbox.style.transform = 'scale(2)';  // ✅ Increase size
checkbox.style.marginRight = '10px';
checkbox.style.cursor = 'pointer';

    label.appendChild(checkbox);
    label.append(folder);

    checkboxRow.appendChild(label);
  });

  // ✅ Inject button
  const injectBtn = document.createElement('button');
  injectBtn.textContent = "Export Selected Folders";
  injectBtn.style.marginTop = "10px";
  injectBtn.addEventListener('click', () => {
    const selected = [...document.querySelectorAll('.folder-checkbox:checked')].map(cb => cb.value);
    if (!selected.length) return alert("Please select at least one folder.");
    injectMultipleFolders(selected);
  });

  container.appendChild(injectBtn);
}

document.addEventListener("DOMContentLoaded", () => {
    const dateInput = document.getElementById("dateInput");
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    dateInput.value = today;
  });

function injectMultipleFolders(folders) {
  disableAllFolderButtons(true, "Injecting...");

  folders.forEach(folder => {
    const elevationData = mergedData.filter(d => d.Folder === folder);
    const rawRows = rawSheetData.filter(d => d.Folder === folder);
    const normalizedRows = rawRows.map(normalizeRawRow);
    const nonLaborRows = normalizedRows.filter(d => !/labor/i.test(d.SKU));
    const breakoutMerged = mergeForMaterialBreakout(nonLaborRows);

    if (!elevationData.length || !breakoutMerged.length) {
      showToast(`⚠️ Skipped "${folder}" due to missing data`);
      return;
    }

    enqueueRequest(() =>
      sendToInjectionServerDualSheet(elevationData, breakoutMerged, folder)
    );
  });

  showToast(`📦 Creating ${folders.length} folder(s)...`);
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

function sendToInjectionServerDualSheet(elevationData, breakoutData, folderName, attempt = 1) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 3000 * attempt;

  return new Promise((resolve, reject) => {
   const payload = {
  data: mergedData,
  breakout: breakoutData,
  type: "combined",
  metadata: getFormMetadata() // ⬅️ This grabs values directly from the visible form inputs
};


    fetch(serverURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(response => {
        if (response.status === 429) {
          if (attempt < MAX_RETRIES) {
            showToast(`⏳ Server busy, retrying "${folderName}" in ${RETRY_DELAY / 1000}s...`);
            return setTimeout(() => {
              enqueueRequest(() => sendToInjectionServerDualSheet(elevationData, breakoutData, folderName, attempt + 1));
              resolve(); // resolve this retry now, continue queue
            }, RETRY_DELAY);
          } else {
            showToast(`❌ "${folderName}" failed after ${MAX_RETRIES} retries`);
            return reject(new Error("Max retries reached"));
          }
        }

        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (!blob) return; // was a retry delay, not blob yet
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${folderName}.xlsb`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast(`✅ "${folderName}" workbook downloaded.`);
        resolve();
      })
      .catch(error => {
        showToast(`❌ Injection failed for "${folderName}": ${error.message}`);
        reject(error);
      });
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

container.innerHTML = '<div id="folderCheckboxRow" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;"></div>';

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
  const rawRows = rawSheetData.filter(d => d.Folder === folder);
  const normalizedRows = rawRows.map(normalizeRawRow);
  const nonLaborRows = normalizedRows.filter(d => !/labor/i.test(d.SKU));
  
  const breakoutMerged = mergeForMaterialBreakout(nonLaborRows);

  if (!breakoutMerged.length) return alert(`No data for ${folder}`);
  sendToInjectionServer(breakoutMerged, folder, "material_breakout");
  showToast(`✅ Injected "${folder}" to Material Break Out`);
});
    container.appendChild(button);
  });
}

function mergeForMaterialBreakout(data) {
  console.log("🔍 Starting mergeForMaterialBreakout with", data.length, "rows");

  const result = {};

  data.forEach((row, index) => {
    const sku = row.SKU?.trim() || "";
    const desc2Raw = row.Description2;
    const desc2 = desc2Raw ?? `__EMPTY_${Math.random()}`; // Treat empty Description2 as unique
    const colorGroup = row.ColorGroup?.trim() || "";
    const qty = parseFloat(row.TotalQty) || 0;

    console.log(`➡️ Row ${index}:`, {
      SKU: sku,
      Description2: desc2Raw,
      NormalizedDescription2: desc2,
      ColorGroup: colorGroup,
      TotalQty: qty,
    });

    // ❌ Skip if SKU contains "labor" (case-insensitive)
    if (sku.toLowerCase().includes("labor")) {
      console.log(`⏭️ Skipping SKU "${sku}" because it includes 'labor'`);
      return;
    }

    const key = `${sku}___${desc2}___${colorGroup}`;
    console.log(`🔑 Generated merge key: ${key}`);

    if (!result[key]) {
      result[key] = {
        ...row,
        TotalQty: 0
      };
      console.log(`🆕 New entry created for key: ${key}`);
    }

    result[key].TotalQty += qty;
    console.log(`➕ Updated TotalQty for key ${key}:`, result[key].TotalQty);
  });

  // Convert to array and round if needed
const merged = Object.values(result).map(item => {
  console.log(`✅ Preserved qty: ${item.TotalQty} (SKU: ${item.SKU})`);
  return item;
});
  console.log("✅ Merging complete. Final item count:", merged.length);
  console.table(merged.map(i => ({
    SKU: i.SKU,
    Description2: i.Description2,
    TotalQty: i.TotalQty,
    ColorGroup: i.ColorGroup
  })));

  return merged;
}

function copyToClipboard(textareaId) {
  const textarea = document.getElementById(textareaId);
  const lines = textarea.value.trim().split("\n");

  // Skip the first line (header)
  const trimmedLines = lines.slice(1);

  const modifiedLines = trimmedLines
    .map(line => {
      const cols = line.split("\t");

      // Skip if SKU contains "labor" (case-insensitive)
      const sku = cols[0]?.toLowerCase();
      if (sku.includes("labor")) return null;

      // Pad columns to at least 6 to prevent index errors
      while (cols.length < 6) {
        cols.push("");
      }

      cols[1] = "";
      cols[3] = "";

      return cols.join("\t");
    })
    .filter(Boolean); // remove nulls

  const modifiedText = modifiedLines.join("\n");

  // 🔍 Log for verification
  console.log("📋 Filtered and Copied to Clipboard:");
  console.log(modifiedText);

  // Copy to clipboard
  const tempTextarea = document.createElement("textarea");
  tempTextarea.value = modifiedText;
  document.body.appendChild(tempTextarea);
  tempTextarea.select();
  document.execCommand("copy");
  document.body.removeChild(tempTextarea);
}






function getFormMetadata() {
  return {
    builder: document.querySelector('input[name="builder"]')?.value || "",
    planName: document.querySelector('input[name="planName"]')?.value || "",
    elevation: document.querySelector('input[name="elevation"]')?.value || "",
    materialType: document.querySelector('input[name="materialType"]')?.value || "",
    date: document.querySelector('input[name="date"]')?.value || "",
    estimator: document.querySelector('input[name="estimator"]')?.value || ""
  };
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

const requestQueue = [];
let isProcessingQueue = false;

function enqueueRequest(fn) {
  requestQueue.push(fn);
  if (!isProcessingQueue) {
    processQueue();
  }
}

function processQueue() {
  if (!requestQueue.length) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const requestFn = requestQueue.shift();
  requestFn().then(() => {
    processQueue();
  });
}



