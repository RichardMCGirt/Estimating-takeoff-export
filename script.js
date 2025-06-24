let mergedData = [];
let mappedWorkbook = null;
let rawSheetData = [];
let isProcessingQueue = false;
let html = "";
let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;
let allSelected = false;
let toggleButton;

const baseServer = "https://63f9-174-108-187-19.ngrok-free.app";
const defaultServer = `${baseServer}/inject`;
const savedServer = localStorage.getItem("injectionServerURL");
const serverURL = savedServer || defaultServer;
const fields = ["builder", "planName", "elevation", "materialType", "date", "estimator"];
document.addEventListener("DOMContentLoaded", () => {
  // Restore saved form fields or default to today's date
  fields.forEach(field => {
    const input = document.querySelector(`[name="${field}"]`);
    const savedValue = localStorage.getItem(field);
    if (input && savedValue !== null) {
      input.value = savedValue;
    }

    // Default to today's date if field is "date" and empty
    if (field === "date" && input && !input.value) {
      input.value = new Date().toISOString().split("T")[0];
    }
  });

  // Attach file input listener
  const fileInput = document.getElementById('sourceFile');
  if (fileInput) {
    fileInput.addEventListener('change', handleSourceUpload);
  }
});

function getFormMetadata() {
  const fields = [
    "builder",
    "planName",
    "elevation",
    "materialType",
    "date",
    "estimator",
    "paintlabor"
  ];

  const metadata = {};
  fields.forEach(field => {
    const input = document.querySelector(`[name="${field}"]`);
    metadata[field] = input?.value.trim() || "";
  });

  // 🧪 Debug logs
  console.table(metadata);

  return metadata;
}

function handleSourceUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  // Process file
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    rawSheetData = json;
    mergedData = mergeBySKU(json);

    localStorage.setItem('mergedData', JSON.stringify(mergedData));
    localStorage.setItem('rawSheetData', JSON.stringify(rawSheetData));

    displayMergedTable(mergedData);
    renderFolderButtons();
    renderMaterialBreakoutButtons();
showToast(`✅ File "${file.name}" processed with ${mergedData.length} items`);

    const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
    const elevationInput = document.querySelector('input[name="elevation"]');

    if (uniqueFolders.length === 1 && (!elevationInput || !elevationInput.value)) {
      injectDynamicElevation(uniqueFolders[0]);
      
    }

    if (uniqueFolders.length === 1) {
      const singleFolder = uniqueFolders[0];
      requestAnimationFrame(() => {
        const checkbox = document.querySelector(`.folder-checkbox[value="${singleFolder}"]`);
        if (checkbox) checkbox.checked = true;
        setTimeout(() => injectMultipleFolders([singleFolder]), 500);
      });
    }

    // ✅ Only reset if it's a real input element (has a .value)
    if (event.target?.type === "file") {
      event.target.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

function injectDynamicElevation(folderName) {
  const formTable = document.querySelector("table"); // or specific ID if known
  if (!formTable) return;

  // Check if row already exists
  if (document.getElementById("dynamicElevationRow")) return;

  const tr = document.createElement("tr");
  tr.id = "dynamicElevationRow";

  const tdLabel = document.createElement("td");
  tdLabel.style.whiteSpace = "nowrap";
  tdLabel.style.width = "1%";
  tdLabel.textContent = "Elevation:";

  const tdInput = document.createElement("td");
  const input = document.createElement("input");
  input.type = "text";
  input.name = "elevation";
  input.value = folderName;
  tdInput.appendChild(input);

  tr.appendChild(tdLabel);
  tr.appendChild(tdInput);

  // Insert before the last row, or append to end
  formTable.appendChild(tr);
  showToast(allSelected ? "✅ All folders selected" : "🔄 All folders deselected");
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

const normalizedFolder = folder.trim().toLowerCase();  // ensures exact folder match
const normalizedSKU = sku.trim().toUpperCase();        // optional: normalize SKU too
const key = `${normalizedSKU}___${normalizedFolder}`;

  const qtyRaw = row[colMap.qty];
  const qty = parseFloat(qtyRaw) || 0;

  if (!result[key]) {
   result[key] = {
  SKU: sku,
Description: row[colMap.description] ?? null,
  Description2: row[colMap.description2] || "",
UOM: row[colMap.uom] ?? null,
  Folder: folder,  // keep original case for display
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
  item.TotalQty = Math.ceil(Math.abs(qty)); // ✅ Always round *up* from the absolute value
}
  return item;
});
const containsZLaborWR = merged.some(item => item.SKU === 'zLABORWR');
if (containsZLaborWR) {
  console.log("🧩 zLABORWR detected in merged data.");
}
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
  wrapper.classList.add("has-data");

  const folders = [...new Set(data.map(d => d.Folder))];
  let allHTML = "";

  folders.forEach((folder, index) => {
    const rows = data.filter(d => d.Folder === folder);
    const nonLabor = rows.filter(d => !/labor/i.test(d.SKU));
    const labor = rows.filter(d => /labor/i.test(d.SKU));

    if (!nonLabor.length && !labor.length) return;

    const sortedNonLabor = [...nonLabor].sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));
    const sortedLabor = [...labor].sort((a, b) => (a.Description || "").localeCompare(b.Description || ""));

    const tableId = `copyTable_${index}`;
    let tsvContent = "";

    const buildRow = row => `
      <tr>
        <td>${row.SKU || ""}</td>
        <td>${row.Description || ""}</td>
        <td>${row.Description2 || ""}</td>
        <td>${row.UOM || ""}</td>
        <td title="Pre-rounded: ${row.TotalQty}">${(row.TotalQty || 0).toFixed(2)}</td>
        <td>${row.ColorGroup || ""}</td>
      </tr>`;

    const buildSpacerRows = () => `
      <tr>${'<td style="border: 1px solid #ccc;">&nbsp;</td>'.repeat(6)}</tr>
      <tr>${'<td style="border: 1px solid #ccc;">&nbsp;</td>'.repeat(6)}</tr>`;

    sortedNonLabor.forEach(row => {
      tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${(row.TotalQty || 0).toFixed(2)}\t${row.ColorGroup || ""}\n`;
    });

    if (sortedLabor.length) {
      tsvContent += `\n\n`;
      sortedLabor.forEach(row => {
        tsvContent += `${row.SKU}\t${row.Description}\t${row.Description2 || ""}\t${row.UOM}\t${(row.TotalQty || 0).toFixed(2)}\t${row.ColorGroup || ""}\n`;
      });
    }

    const headerRow = `
      <tr>
        <th>SKU</th>
        <th>Description</th>
        <th>Description 2</th>
        <th>UOM</th>
        <th>QTY</th>
        <th>Color Group</th>
      </tr>`;

    let tableHTML = `
      <h3>${folder}</h3>
      <button onclick="copyToClipboard('${tableId}')">Copy ${folder} to Clipboard</button>
      <textarea id="${tableId}" style="display:none;">${tsvContent.trim()}</textarea>
      <table style="width:100%; text-align:center; border-collapse: collapse;">
        <thead>${headerRow}</thead>
        <tbody>
          ${sortedNonLabor.map(buildRow).join("")}
          ${sortedLabor.length ? buildSpacerRows() : ""}
          ${sortedLabor.map(buildRow).join("")}
        </tbody>
      </table><br/>`;

    allHTML += tableHTML;
  });

  container.innerHTML = allHTML;
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

function autoResizeInput(input) {
  input.style.width = '1px'; // reset
  input.style.width = input.scrollWidth + 'px';
}

// For all matching inputs
document.querySelectorAll('input[type="text"], input[type="date"], input[type="number"]').forEach(input => {
  // Resize on input change (user typing)
  input.addEventListener('input', () => autoResizeInput(input));

  // Resize if JS sets a value
  autoResizeInput(input);
});

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
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.folder-checkbox');
    allSelected = !allSelected;
    checkboxes.forEach(cb => cb.checked = allSelected);
    selectAllBtn.textContent = allSelected ? "Deselect All" : "Select All";
  });

  container.appendChild(selectAllBtn);
  const checkboxRow = document.createElement('div');
  checkboxRow.id = 'folderCheckboxRow';
  checkboxRow.style.display = 'flex';
  checkboxRow.style.flexWrap = 'wrap';
  checkboxRow.style.gap = '18px';
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
    label.style.fontSize = '24px'; 

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = folder;
    checkbox.classList.add('folder-checkbox');
    checkbox.style.marginRight = '8px';
    checkbox.style.transform = 'scale(2)'; 
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
  const toggleButton = document.getElementById("darkModeToggle");
  const body = document.body;

  function updateButtonText() {
    if (!toggleButton) return;
    toggleButton.textContent = body.classList.contains("dark")
      ? "Switch to Light Mode"
      : "Switch to Dark Mode";
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      body.classList.toggle("dark");
      localStorage.setItem("darkMode", body.classList.contains("dark"));
      console.log("🌓 Toggled dark mode:", body.classList.contains("dark"));
      updateButtonText();
    });

    if (localStorage.getItem("darkMode") === "true") {
      body.classList.add("dark");
      console.log("🌙 Dark mode enabled from saved state.");
    } else {
      console.log("☀️ Light mode enabled from saved state.");
    }

    updateButtonText();
  }
});

function injectMultipleFolders(folders) {
  disableAllFolderButtons(true, "Injecting...");

  folders.forEach(folder => {
    const elevationData = mergedData.filter(d => d.Folder === folder);
    const rawRows = rawSheetData.filter(d => d.Folder === folder);
    const normalizedRows = rawRows.map(normalizeRawRow);
    const nonLaborRows = normalizedRows.filter(d => !/labor/i.test(d.SKU));
    const breakoutMerged = mergeForMaterialBreakout(nonLaborRows);

   if (!elevationData.length) {
  showToast(`⚠️ Skipped "${folder}" due to missing elevation data`);
  return;
}

if (!breakoutMerged.length) {
  console.warn(`⚠️ No non-labor breakout data for "${folder}", continuing with elevation data only`);
}
    enqueueRequest(() => {
  const hasZLaborWR = elevationData.some(d => d.SKU === "zLABORWR");
  if (hasZLaborWR) {
    console.log(`🚀 Folder "${folder}" contains zLABORWR with qty:`,
      elevationData.find(d => d.SKU === "zLABORWR")?.TotalQty);
  }
  return sendToInjectionServerDualSheet(elevationData, breakoutMerged || [], folder);
});

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

function parseLaborRate(value) {
  if (!value) return null;
  const cleaned = value.toString().replace(/[^\d.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getLaborRates() {
  const laborRates = {};

  // 1. Standard fields from predefinedLaborFields
  predefinedLaborFields.forEach(({ name }) => {
    const input = document.querySelector(`input[name="${name}"]`);
    if (input) {
      const parsed = parseLaborRate(input.value);
      if (parsed !== null) laborRates[name] = parsed;
    }
  });

  // 2. Custom fields added under "otherLabor"
  document.querySelectorAll('input[data-custom-labor="true"]').forEach(input => {
    const name = input.name;
    const parsed = parseLaborRate(input.value);
    if (name && parsed !== null) {
      laborRates[name] = parsed;
    }
  });

  return laborRates;
}




function sendToInjectionServerDualSheet(elevationData, breakoutData, folderName, attempt = 1) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 3000 * attempt;

  return new Promise((resolve, reject) => {
    const metadata = getFormMetadata();
metadata.paintlabor = parseLaborRate(
  document.querySelector('input[name="paintLabor"]')?.value ||
        document.querySelector('input[name="paintlabor"]')?.value

);

    const laborRates = getLaborRates(); // ✅ collect all labor rates
 // 🔍 Add this debug log here
    console.log("🧠 Final laborRates:", laborRates);
    console.log("📦 Sending payload:", { metadata, laborRates, folderName });
    const payload = {
      data: elevationData,
      breakout: breakoutData,
      type: "combined",
      metadata,
      laborRates
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
          setTimeout(() => {
            enqueueRequest(() =>
              sendToInjectionServerDualSheet(elevationData, breakoutData, folderName, attempt + 1)
            );
            resolve(); // resolve here so it doesn't hang the queue
          }, RETRY_DELAY);
        } else {
          showToast(`❌ "${folderName}" failed after ${MAX_RETRIES} retries`);
          reject(new Error("Max retries reached"));
        }
        return;
      }

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      return response.blob();
    })
    .then(blob => {
      if (!blob) return;
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

  window.currentJSONBlob = blob;
  window.currentJSONFilename = filename;

  // Auto-decide type: "material_breakout" if folder name includes breakout, else "elevation"
  const isBreakout = /break\s*out/i.test(folder) || folder.toLowerCase() === "screen porch";
  const injectionType = isBreakout ? "material_breakout" : "elevation";
  const nonLabor = filteredData.filter(d => !/labor/i.test(d.SKU));
  if (!nonLabor.length && !isBreakout) return alert(`No non-labor data to inject for ${folder}`);
  const dataToSend = isBreakout ? filteredData : nonLabor.length ? nonLabor : filteredData;

sendToInjectionServer(
  dataToSend,
  folder,
  injectionType
);
  showToast(`✅ Sent "${folder}" to server (${injectionType})`);
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

  // ✅ Continue with injection
  sendToInjectionServer(breakoutMerged, folder, "material_breakout");
showToast(`✅ Material Breakout injected for "${folder}" (${breakoutMerged.length} items)`);
});
   container.appendChild(button);
  });
}

function mergeForMaterialBreakout(data, skipLabor = true) {

  const result = {};

  data.forEach((row, index) => {
    const sku = row.SKU?.trim() || "";
    const desc2Raw = row.Description2;
    const desc2 = desc2Raw ?? `__EMPTY_${Math.random()}`; 
    const colorGroup = row.ColorGroup?.trim() || "";
    const qty = parseFloat(row.TotalQty) || 0;
     const key = `${sku}___${desc2}___${colorGroup}`;
    if (!result[key]) {
      result[key] = {
        ...row,
        TotalQty: 0
      };
    }
    result[key].TotalQty += qty;
  });

const merged = Object.values(result).map(item => {
  return item;
});
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
  const trimmedLines = lines.slice(1);
  const modifiedLines = trimmedLines
  
    .map(line => {
      const cols = line.split("\t");

      const sku = cols[0]?.toLowerCase();
      if (sku.includes("labor")) return null;

      while (cols.length < 6) {
        cols.push("");
      }
      cols[1] = "";
      cols[3] = "";
      return cols.join("\t");
    })
    .filter(Boolean); 

  const modifiedText = modifiedLines.join("\n");
  const tempTextarea = document.createElement("textarea");
  tempTextarea.value = modifiedText;
  document.body.appendChild(tempTextarea);
  tempTextarea.select();
  document.execCommand("copy");
  document.body.removeChild(tempTextarea);
  showToast("📋 Copied to clipboard (non-labor only)");
}

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('sourceFile');
  const clickableText = document.querySelector('.click-browse');

  if (clickableText && fileInput) {
    clickableText.addEventListener('click', (e) => {
      e.stopPropagation(); 
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
handleSourceUpload({ target: { files } });
  }
});
  }
});

const requestQueue = [];

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
  
function updateButtonText() {
  const body = document.body;
  toggleButton.textContent = body.classList.contains('dark')
    ? 'Switch to Light Mode'
    : 'Switch to Dark Mode';
}

function getLaborRates() {
  const laborRates = {};

  // Handle all predefined fields (like lapLabor, ceilingLabor, etc.)
  predefinedLaborFields.forEach(({ name }) => {
    const input = document.querySelector(`input[name="${name}"]`);
    if (input) {
      const parsed = parseLaborRate(input.value);
      if (parsed !== null) laborRates[name] = parsed;
    }
  });

// ✅ Directly get the otherLabor input
const otherLaborInput = document.querySelector('input[name="otherLabor"]');
if (otherLaborInput) {
  const raw = otherLaborInput.value?.trim();
  if (raw) {
    const parsed = parseLaborRate(raw);
    if (parsed !== null) {
      laborRates["otherLabor"] = parsed;
    }
  }
}

// ✅ Dynamically added custom labor inputs
document.querySelectorAll('input[data-custom-labor="true"]').forEach(input => {
  const name = input.name;
  const parsed = parseLaborRate(input.value);
  if (parsed !== null && name) {
    laborRates[name] = parsed;
  }
});


  return laborRates;
}


document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("laborRatesForm");
  if (!form) {
    console.warn("⚠️ laborRatesForm not found.");
    return;
  }

  const inputs = form.querySelectorAll("input[name]");

  inputs.forEach(input => {
    input.addEventListener("input", () => {
      console.log(`📝 ${input.name} updated → ${input.value}`);
    });
  });
});

function attachLaborRateInputListeners() {
  const form = document.getElementById("laborRatesForm");
  if (!form) return;

  const inputs = form.querySelectorAll("input[name]");
  inputs.forEach(input => {
    input.addEventListener("input", (e) => {
      console.log(`📝 ${input.name} updated → ${e.target.value}`);
    });
  });
}

// Attach listeners once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  attachLaborRateInputListeners();
});

document.addEventListener("DOMContentLoaded", () => {
  const estimateForm = document.getElementById("estimateForm");
  if (estimateForm) {
    estimateForm.querySelectorAll("input[name]").forEach(input => {
      input.addEventListener("input", () => {
      });

      input.addEventListener("focus", () => {
        input.value = input.value.replace(/^\$/, '');
      });

      input.addEventListener("blur", () => {
        const raw = input.value.replace(/[^\d.\-]/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val)) {
          input.value = `$${val.toFixed(2)}`;
        } else {
          input.value = '';
        }
      });
    });
  }
}); 


function areRequiredFieldsFilled() {
  const sidingStyle = document.querySelector('input[name="materialType"]')?.value?.trim();
  const branch = document.getElementById('branchSelect')?.value?.trim();
  const projectType = document.getElementById('ProjectSelect')?.value?.trim();

  return sidingStyle && branch && projectType;
}

