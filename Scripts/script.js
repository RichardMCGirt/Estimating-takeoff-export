let mergedData = [];
let mappedWorkbook = null;
let rawSheetData = [];
let isProcessingQueue = false;
let html = "";
let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;
let allSelected = false;
let toggleButton;

const baseServer = "https://0e96e65f7e1c.ngrok-free.app";
const defaultServer = `${baseServer}/inject`;
const savedServer = localStorage.getItem("injectionServerURL");
const serverURL = savedServer || defaultServer;
const fields = ["builder", "planName", "elevation", "materialType", "date", "estimator"];

document.addEventListener("DOMContentLoaded", () => {
  // === 1. Attach Input Listeners for Labor Rates Form ===
  attachLaborRateInputListeners();

  const estimateForm = document.getElementById("estimateForm");
if (estimateForm) {
  estimateForm.querySelectorAll('input[name][data-currency="true"]').forEach(input => {
    input.addEventListener("input", () => {
    });

    input.addEventListener("focus", () => {
      input.value = input.value.replace(/^\$/, '');
    });

    input.addEventListener("blur", () => {
      const raw = input.value.replace(/[^\d.\-]/g, '');
      const val = parseFloat(raw);
      input.value = !isNaN(val) ? `$${val.toFixed(2)}` : input.value; 
    });
  });
}


  // === 2. Restore Saved Fields or Set Today's Date ===
  if (typeof fields !== "undefined" && Array.isArray(fields)) {
    fields.forEach(field => {
      const input = document.querySelector(`[name="${field}"]`);
      
      if (field === "date" && input && !input.value) {
        const today = new Date().toISOString().split("T")[0];
        input.value = today;
      }
    });
  }

  // === 3. Handle Source File Upload ===
  const fileInput = document.getElementById('sourceFile');
  if (fileInput) {
    fileInput.addEventListener('change', handleSourceUpload);
  }

  // === 4. Input Logging for Labor Rates ===
  const laborForm = document.getElementById("laborRatesForm");
  if (laborForm) {
    laborForm.querySelectorAll("input[name]").forEach(input => {
      input.addEventListener("input", () => {
        console.log(`📝 ${input.name} updated → ${input.value}`);
      });
    });
  } else {
    console.warn("⚠️ laborRatesForm not found.");
  }

  // === 5. Restore Session from localStorage ===
  const storedData = localStorage.getItem("mergedData");
  if (storedData) {
    try {
      mergedData = JSON.parse(storedData);
      displayMergedTable(mergedData);
      renderFolderButtons();
      renderMaterialBreakoutButtons();
      showToast(`📦 Restored previous session with ${mergedData.length} items`);
    } catch (err) {
      console.error("❌ Failed to parse stored mergedData:", err);
      localStorage.removeItem("mergedData");
    }
  }

  // === 6. Dark Mode Toggle Setup ===
 const toggleButton = document.getElementById("darkModeToggle");
  const body = document.body;

  // Set initial theme based on localStorage
  const darkModeEnabled = localStorage.getItem("darkMode") === "true";
  if (darkModeEnabled) body.classList.add("dark");
  else body.classList.remove("dark");

  updateButtonText();

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      const isNowDark = body.classList.toggle("dark");
      localStorage.setItem("darkMode", isNowDark);
      updateButtonText();
      console.log(`🌓 Toggled dark mode: ${isNowDark}`);
    });
  }

  function updateButtonText() {
    if (!toggleButton) return;
    const isDark = body.classList.contains("dark");
    toggleButton.textContent = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
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

function detectCollapsedColors(normalizedRows, merged) {
  // Map raw SKU+Folder → set of colors
  const rawMap = new Map();
  for (const r of normalizedRows) {
    const sku = (r.SKU || "").toString().trim().toUpperCase();
    const folder = (r.Folder || "").toString().trim().toLowerCase();
    const color = (r.ColorGroup || "").toString().replace(/\s+/g, ' ').trim().toUpperCase();
    if (!sku || !folder) continue;
    const k = `${sku}___${folder}`;
    if (!rawMap.has(k)) rawMap.set(k, new Set());
    if (color) rawMap.get(k).add(color);
  }

  // Map merged SKU+Folder → set of colors present after merge
  const mergedMap = new Map();
  for (const m of merged) {
    const sku = (m.SKU || "").toString().trim().toUpperCase();
    const folder = (m.Folder || "").toString().trim().toLowerCase();
    const color = (m.ColorGroup || "").toString().replace(/\s+/g, ' ').trim().toUpperCase();
    if (!sku || !folder) continue;
    const k = `${sku}___${folder}`;
    if (!mergedMap.has(k)) mergedMap.set(k, new Set());
    if (color) mergedMap.get(k).add(color);
  }

  // If raw had >1 color for any SKU+Folder but merged has <=1, we collapsed
  for (const [k, rawSet] of rawMap.entries()) {
    const mergedSet = mergedMap.get(k) || new Set();
    if (rawSet.size > 1 && mergedSet.size <= 1) {
      console.warn(`⚠️ Color collapse detected for ${k}: raw=${[...rawSet]} merged=${[...mergedSet]}`);
      return true;
    }
  }
  return false;
}

function enforceColorSplit(normalizedRows, allowRounding = true) {
  // Re-merge strictly by SKU+Folder+ColorGroup (case preserved for display)
  const result = {};
  for (const r of normalizedRows) {
    const sku = (r.SKU || "").toString().trim().toUpperCase();
    const folder = (r.Folder || "").toString().trim();

    // display string keeps original case; key uses uppercased normalized form
    const colorDisplay = (r.ColorGroup || "").toString().replace(/\s+/g, ' ').trim();
    const colorKey = colorDisplay.toUpperCase();

    if (!sku || !folder) continue;

    const key = `${sku}___${folder.toLowerCase()}___${colorKey}`;
    const qty = parseFloat(r.TotalQty) || 0;

    if (!result[key]) {
      result[key] = {
        SKU: r.SKU || "",
        Description: r.Description ?? null,
        Description2: r.Description2 || "",
        UOM: r.UOM ?? null,
        Folder: folder,
        ColorGroup: colorDisplay || "", // ← preserve case
        Vendor: r.Vendor || "",
        UnitCost: parseFloat(r.UnitCost) || 0,
        TotalQty: 0
      };
    }
    result[key].TotalQty += qty;
  }

  // Always round up when rounding is enabled (and not labor / SQ)
  return Object.values(result).map(item => {
    const isLabor = item.SKU.toLowerCase().includes("labor");
    const uom = (item.UOM || "").toString().trim().toUpperCase();
    const skip = !allowRounding || isLabor || uom === "SQ";
    if (!skip) item.TotalQty = Math.ceil(Math.abs(item.TotalQty));
    return item;
  });
}

function handleSourceUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Flag the template
    window.isTakeoffTemplate = (sheetName || "").trim().toLowerCase() === "takeoff template";
    console.log("📄 Loaded sheet:", sheetName, "→ isTakeoffTemplate =", window.isTakeoffTemplate);

    // ✅ Normalize ONCE for mergedData display
    const normalizedRows = json.map(normalizeRawRow);

    // ✅ Keep original raw rows here so we can (re)normalize later as needed
    rawSheetData = json; // <-- key change (was: normalizedRows)

    // Build merged data for UI
    mergedData = mergeBySKU(normalizedRows, true, {
      respectColorGroupOnTakeoff: true
    });

    // Safety net for color collapse
    if (detectCollapsedColors(normalizedRows, mergedData)) {
      console.warn("🧯 Detected collapsed colors after merge — rebuilding with color-enforced merge.");
      mergedData = enforceColorSplit(normalizedRows, true);
    }

    localStorage.setItem('mergedData', JSON.stringify(mergedData));
    localStorage.setItem('rawSheetData', JSON.stringify(rawSheetData)); // stores ORIGINAL json

    displayMergedTable(mergedData);
    renderFolderButtons();
    renderMaterialBreakoutButtons();
    showToast(`✅ File "${file.name}" processed with ${mergedData.length} items`);

    const uniqueFolders = [...new Set(mergedData.map(d => d.Folder))];
 

    if (uniqueFolders.length === 1) {
      const singleFolder = uniqueFolders[0];
      requestAnimationFrame(() => {
        const checkbox = document.querySelector(`.folder-checkbox[value="${singleFolder}"]`);
        if (checkbox) checkbox.checked = true;
        setTimeout(() => injectMultipleFolders([singleFolder]), 500);
      });
    }

    if (event.target?.type === "file") {
      event.target.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

function injectMultipleFolders(folders) {
  if (!folders.length) return;

  showLoadingOverlay(true, `Exporting ${folders.length} folder(s)...`);
  disableAllFolderButtons(true, "Injecting...");

  let completed = 0;
  let failed = 0;

  const exportPromises = folders.map(folder => {
    // Normalize ONCE from whatever is in rawSheetData
    const allRaw = Array.isArray(rawSheetData) ? rawSheetData : [];
    const isAlreadyNormalized =
      allRaw.length > 0 && "SKU" in allRaw[0] && "TotalQty" in allRaw[0] && "Folder" in allRaw[0];

    const normalizedAll = isAlreadyNormalized ? allRaw : allRaw.map(normalizeRawRow);

    // Filter AFTER normalization
    const normalizedRows = normalizedAll.filter(d => d.Folder === folder);
    const nonLaborRows = normalizedRows.filter(d => !/labor/i.test(d.SKU));

    // Build breakout, keep ColorGroup splits, no rounding
    const breakoutMerged = mergeBySKU(nonLaborRows, false, {
      respectColorGroupOnTakeoff: !!window.isTakeoffTemplate
    });

    // TotalQty → QTY (number) for the server/template
    const breakoutForServer = breakoutMerged.map(r => ({
      ...r,
      QTY: Number(r.TotalQty) || 0
    }));

    // Elevation/main data for this folder from mergedData (already built for UI)
    const elevationData = mergedData.filter(d => d.Folder === folder);

    console.log(`📦 Breakout payload for "${folder}" (first 5):`,
      breakoutForServer.slice(0, 5).map(x => ({
        SKU: x.SKU, Desc2: x.Description2, Color: x.ColorGroup, QTY: x.QTY
      }))
    );

    if (!elevationData.length) {
      showToast(`⚠️ Skipped "${folder}" due to missing elevation data`);
      return Promise.resolve();
    }

    return sendToInjectionServerDualSheet(elevationData, breakoutForServer, folder)
      .then(() => { completed++; })
      .catch(() => { failed++; });
  });

  Promise.allSettled(exportPromises).then(() => {
    showLoadingOverlay(false);
    disableAllFolderButtons(false);

    if (completed && !failed) showToast(`✅ All ${completed} folders exported!`);
    else if (completed && failed) showToast(`⚠️ ${completed} exported, ${failed} failed`);
    else showToast(`❌ All exports failed`);
  });

  showToast(`📦 Creating ${folders.length} folder(s)...`);
}



function injectMaterialBreakout() {
  if (!mergedData.length) {
    alert("No merged data found.");
    return;
  }
  sendToInjectionServer(mergedData, "Material_Break_Out", "material_breakout");
}

function showToast(message = "Success!", duration = 3000) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.visibility = "visible";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.visibility = "hidden";
    }, 300);
  }, duration);
}

function mergeBySKU(data, allowRounding = true, options = {}) {
  if (!Array.isArray(data) || !data.length) return [];

  const { respectColorGroupOnTakeoff = false } = options;

  // --- Header mapping helpers ---
  const sampleRow = data[0];
  const normalizedHeaders = {};
  Object.keys(sampleRow).forEach(key => {
    const keyLower = key.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
    normalizedHeaders[keyLower] = key;
  });

  function getHeaderMatch(possibleNames, headers) {
    const keys = Object.keys(headers);
    // exact first
    for (const name of possibleNames) {
      const n = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
      const exact = keys.find(k => k === n);
      if (exact) return headers[exact];
    }
    // partial fallback
    for (const name of possibleNames) {
      const n = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
      const partial = keys.find(k => k.includes(n));
      if (partial) return headers[partial];
    }
    return "";
  }

  const colMap = {
    sku:         getHeaderMatch(["sku", "sku#", "skunumber"], normalizedHeaders),
    description: getHeaderMatch(["description"], normalizedHeaders),
    description2:getHeaderMatch(["description2", "desc2"], normalizedHeaders),
    uom:         getHeaderMatch(["uom", "unitofmeasure", "units", "uomlf", "uom(lf)", "uom_"], normalizedHeaders),
    folder:      getHeaderMatch(["folder", "elevation"], normalizedHeaders),
    colorgroup:  getHeaderMatch(["color group", "colorgroup", "colorgrp", "color"], normalizedHeaders),
    vendor:      getHeaderMatch(["vendor"], normalizedHeaders),
    unitcost:    getHeaderMatch(["unitcost", "cost"], normalizedHeaders),
    qty:         getHeaderMatch(["qty", "quantity"], normalizedHeaders),
  };

  // --- Pre-scan: detect if any SKU+Folder has multiple Color Groups ---
  const colorSets = new Map(); // keyNoColor -> Set of COLOR KEYS
  if (colMap.colorgroup) {
    for (const row of data) {
      const sku = (row[colMap.sku] ?? "").toString().trim().toUpperCase();
      const folder = (row[colMap.folder] ?? "").toString().trim().toLowerCase();
      if (!sku || !folder) continue;

      const colorKey = (row[colMap.colorgroup] ?? "")
        .toString()
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

      const keyNoColor = `${sku}___${folder}`;
      if (!colorSets.has(keyNoColor)) colorSets.set(keyNoColor, new Set());
      if (colorKey) colorSets.get(keyNoColor).add(colorKey);
    }
  }

  function mustRespectColor(keyNoColor) {
    if (respectColorGroupOnTakeoff) return true;
    const set = colorSets.get(keyNoColor);
    return set && set.size > 1;
  }

  // Debug: DUOSIL pre-merge sample
  const hasCG = !!colMap.colorgroup;
  const debugDuosil = data
    .filter(r => (r[colMap.sku] || "").toString().trim().toUpperCase() === "DUOSIL")
    .map(r => ({
      SKU: (r[colMap.sku] || "").toString().trim().toUpperCase(),
      Folder: (r[colMap.folder] || "").toString().trim(),
      ColorRaw: hasCG ? (r[colMap.colorgroup] ?? "") : "",
      ColorNorm: hasCG ? (r[colMap.colorgroup] ?? "").toString().replace(/\s+/g, ' ').trim().toUpperCase() : ""
    }));
  if (debugDuosil.length) console.table(debugDuosil);

  const result = {};

  for (const row of data) {
    const sku = (row[colMap.sku] ?? "").toString().trim();
    const folder = (row[colMap.folder] ?? "").toString().trim();
    if (!sku || !folder) continue;

    const skuNorm = sku.toUpperCase();
    const folderNorm = folder.toLowerCase();
    const keyNoColor = `${skuNorm}___${folderNorm}`;

    // Display vs key: keep original case for display, use uppercase for grouping
    let colorDisplay = "";
    let colorKey = "";
    if (colMap.colorgroup) {
      const raw = (row[colMap.colorgroup] ?? "").toString();
      colorDisplay = raw.replace(/\s+/g, ' ').trim(); // preserve case for output
      colorKey = colorDisplay.toUpperCase();          // normalized for grouping/keys
    }

    const includeColor = mustRespectColor(keyNoColor);
    const key = includeColor ? `${keyNoColor}___${colorKey}` : keyNoColor;

    const qty = parseFloat(row[colMap.qty]) || 0;

    if (!result[key]) {
      result[key] = {
        SKU: sku,
        Description: row[colMap.description] ?? null,
        Description2: row[colMap.description2] || "",
        UOM: row[colMap.uom] ?? null,
        Folder: folder,
        ColorGroup: includeColor ? (colorDisplay || "") : (row[colMap.colorgroup] ?? ""), // ← preserve case
        Vendor: row[colMap.vendor] || "",
        UnitCost: parseFloat(row[colMap.unitcost]) || 0,
        TotalQty: 0
      };
    }
    result[key].TotalQty += qty;
  }

  const merged = Object.values(result).map(item => {
    const isLabor = item.SKU?.toLowerCase().includes("labor");
    const uom = (item.UOM ?? "").toString().trim().toUpperCase();
    const skipRounding = !allowRounding || isLabor || uom === "SQ";
    if (!skipRounding) {
      item.TotalQty = Math.ceil(Math.abs(item.TotalQty)); // always round up
    }
    return item;
  });

  // Post-merge DUOSIL check
  const duosilGroups = merged
    .filter(i => (i.SKU || "").toUpperCase() === "DUOSIL")
    .map(i => `${i.Folder} :: ${((i.ColorGroup ?? "").toString() || "").toString()} :: ${i.TotalQty}`);
  if (duosilGroups.length) {
    console.log("🔍 Post-merge DUOSIL groups (Folder :: Color :: Qty):", duosilGroups);
  }

  return merged;
}

function injectDynamicElevation(folderName) {
  const formTable = document.querySelector("table");
  if (!formTable) return;

  // avoid duplicates
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

  formTable.appendChild(tr);
  showToast(allSelected ? "✅ All folders selected" : "🔄 All folders deselected");
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
  container.innerHTML = ""; // clear old content

  const folders = [...new Set(data.map(d => d.Folder))];

  folders.forEach((folder, index) => {
    const rows = data.filter(d => d.Folder === folder);
    const nonLabor = rows.filter(d => !/labor/i.test(d.SKU));
    const labor = rows.filter(d => /labor/i.test(d.SKU));

    if (!nonLabor.length && !labor.length) return;

 const sortedNonLabor = [...nonLabor].sort((a, b) => {
  const ca = (a.ColorGroup || "").localeCompare(b.ColorGroup || "");
  if (ca !== 0) return ca;
  return (a.Description || "").localeCompare(b.Description || "");
});
const sortedLabor = [...labor].sort((a, b) => {
  const ca = (a.ColorGroup || "").localeCompare(b.ColorGroup || "");
  if (ca !== 0) return ca;
  return (a.Description || "").localeCompare(b.Description || "");
});


const tableId = `copyTable_${folder.replace(/\W+/g, '_')}_${index}_${Date.now()}`;
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

    // Create section container
    const section = document.createElement("section");

    // Create and insert heading
    const heading = document.createElement("h3");
    heading.textContent = folder;
    section.appendChild(heading);

    // Create and insert button
    const button = document.createElement("button");
    button.classList.add("copy-button");
    button.textContent = `Copy ${folder} to Clipboard`;
button.addEventListener('click', () => {
  console.log("🔘 Copy button clicked:", tableId);
  copyToClipboard(tableId);
});
    section.appendChild(button);

    // Create and insert textarea with TSV
    const textarea = document.createElement("textarea");
textarea.id = tableId;
textarea.style.display = "none";
textarea.value = tsvContent.trim(); 
section.appendChild(textarea);

    // Create and insert table
    const tableHTML = `
      <table style="width:100%; text-align:center; border-collapse: collapse;">
        <thead>${headerRow}</thead>
        <tbody>
          ${sortedNonLabor.map(buildRow).join("")}
          ${sortedLabor.length ? buildSpacerRows() : ""}
          ${sortedLabor.map(buildRow).join("")}
        </tbody>
      </table><br/>`;
const tableContainer = document.createElement("div");
tableContainer.innerHTML = tableHTML;
section.appendChild(tableContainer);

    // Append the section to container
    container.appendChild(section);
  });
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
checkboxRow.classList.add('folder-checkbox-row');

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
  label.classList.add('folder-label'); // ✅ use class, not inline styles

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = folder;
  checkbox.classList.add('folder-checkbox'); // ✅ styling handled by CSS

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

  // Built-in fields like paintLabor, etc.
  document.querySelectorAll('input[name][data-labor]').forEach(input => {
    const name = input.name;
    const parsed = parseLaborRate(input.value || "");
    if (parsed !== null && name) {
      laborRates[name] = parsed;
    }
  });

  // Custom labor fields like zLABORBB
  document.querySelectorAll('input[data-custom-labor="true"]').forEach(input => {
    const name = input.name;
    const parsed = parseLaborRate(input.value || "");
    if (parsed !== null && name) {
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

    // Parse paint labor (optional)
    const paintInput =
      document.querySelector('input[name="paintLabor"]') ||
      document.querySelector('input[name="paintlabor"]');
    metadata.paintlabor = parseLaborRate(paintInput?.value || "");

    // Collect all labor rates
    const laborRates = getLaborRates();

    // Construct payload
    const payload = {
      data: elevationData,
      breakout: breakoutData,
      type: "combined",
      metadata,
      laborRates
    };

    console.log("🚀 Sending payload", payload);

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
              resolve();
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

        // 🔹 File name = ONLY the elevation/folder
        const safe = val => (val || "").toString().trim().replace(/[<>:"/\\|?*]+/g, "_");
        const elevationForFile = folderName || metadata.elevation || "Takeoff";
        const fileName = `${safe(elevationForFile)}.xlsb`;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName; // ← exactly the elevation only
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showToast(`✅ "${fileName}" workbook downloaded.`);
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
      // Build breakout on demand
      const allRaw = Array.isArray(rawSheetData) ? rawSheetData : [];
      const isAlreadyNormalized =
        allRaw.length > 0 && "SKU" in allRaw[0] && "TotalQty" in allRaw[0] && "Folder" in allRaw[0];
      const normalizedAll = isAlreadyNormalized ? allRaw : allRaw.map(normalizeRawRow);
      const normalizedRows = normalizedAll.filter(d => d.Folder === folder);
      const nonLaborRows = normalizedRows.filter(d => !/labor/i.test(d.SKU));
      const breakoutMerged = mergeBySKU(nonLaborRows, false, {
        respectColorGroupOnTakeoff: !!window.isTakeoffTemplate
      });
      const breakoutForServer = breakoutMerged.map(r => ({ ...r, QTY: Number(r.TotalQty) || 0 }));

      console.log(`⬇️ On-demand breakout for "${folder}"`, breakoutForServer.slice(0, 5));
      sendToInjectionServer(breakoutForServer, folder, "material_breakout");
      showToast(`✅ Material Breakout injected for "${folder}" (${breakoutForServer.length} items)`);
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
  const sourceTextarea = document.getElementById(textareaId);
  if (!sourceTextarea) {
    console.warn(`❌ Textarea with ID "${textareaId}" not found.`);
    showToast(`❌ Text area "${textareaId}" not found`);
    return;
  }

  const originalContent = sourceTextarea.value.trim();
  console.log("📋 Original content:", originalContent);

  const lines = originalContent.split("\n");
  const trimmedLines = lines; // Don't skip anything
  const modifiedLines = trimmedLines.map((line, index) => {
    const cols = line.split("\t");
    const sku = cols[0]?.toLowerCase();
    if (sku.includes("labor")) {
      return null;
    }

    while (cols.length < 6) cols.push("");
    cols[1] = ""; // Blank description
    cols[3] = ""; // Blank UOM
    const modified = cols.join("\t");
    console.log(`✅ Modified line ${index + 2}:`, modified);
    return modified;
  }).filter(Boolean);

  const finalText = modifiedLines.join("\n");

  // ✅ Use a temporary <textarea> for reliable copying
  const temp = document.createElement("textarea");
  temp.value = finalText;
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  temp.setAttribute("readonly", "");
  document.body.appendChild(temp);
  temp.select();

  try {
    const success = document.execCommand("copy");
    if (success) {
      console.log("✅ Copy to clipboard succeeded");
      showToast("📋 Copied to clipboard!");
    } else {
      console.error("❌ Copy to clipboard failed (execCommand returned false)");
      showToast("❌ Copy failed. Please try manually.");
    }
  } catch (err) {
    console.error("❌ Copy to clipboard error:", err);
    showToast("❌ Error copying to clipboard.");
  }

  document.body.removeChild(temp);
}

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('sourceFile');
  const clickableText = document.querySelector('.click-browse');
const storedRaw = localStorage.getItem("rawSheetData");
if (storedRaw) {
  rawSheetData = JSON.parse(storedRaw);
}

  if (clickableText && fileInput) {
    clickableText.addEventListener('click', (e) => {
      e.stopPropagation(); 
      fileInput.click();
    });
  }
console.log("📁 rawSheetData folders:", [...new Set(rawSheetData.map(r => r.Folder))]);

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

function areRequiredFieldsFilled() {
  const sidingStyle = document.querySelector('input[name="materialType"]')?.value?.trim();
  const branch = document.getElementById('branchSelect')?.value?.trim();
  const projectType = document.getElementById('ProjectSelect')?.value?.trim();

  return sidingStyle && branch && projectType;
}