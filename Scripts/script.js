let mergedData = [];
let mappedWorkbook = null;
let rawSheetData = [];
let isProcessingQueue = false;
let html = "";
let tsvContent = `SKU\tDescription\tDescription 2\tUOM\tQTY\tColor Group\n`;
let allSelected = false;
let toggleButton;
let skuLookup = new Map(); // SKU -> { Description, UOM }
// Define exact column order for "Material Break Out" sheet


const BREAKOUT_GROUP_BY = "desc2+sku"; 

const baseServer = "https://3626f0267038.ngrok-free.app"

const defaultServer = `${baseServer}/inject`;
const savedServer = localStorage.getItem("injectionServerURL");
const serverURL = savedServer || defaultServer;
const fields = ["builder", "planName", "elevation", "materialType", "date", "estimator"];
function sortBySkuAscending(arr) {
  return [...(arr || [])].sort((a, b) =>
    String(a?.SKU || '').toUpperCase()
      .localeCompare(String(b?.SKU || '').toUpperCase())
  );
}
document.addEventListener("DOMContentLoaded", () => {
  // === 1. Attach Input Listeners for Labor Rates Form ===
  attachLaborRateInputListeners();

  const estimateForm = document.getElementById("estimateForm");
  if (estimateForm) {
    estimateForm.querySelectorAll('input[name][data-currency="true"]').forEach(input => {
      input.addEventListener("input", () => {});

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
// --- Sorting helper: A → Z by SKU (case-insensitive) ---


  // Build a SKU lookup from the "Data" sheet rows
function buildSkuLookupFromData(dataRows) {
  const map = new Map();
  if (!Array.isArray(dataRows)) return map;

  const norm = s => s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  const pick = (row, names) => {
    const idx = {};
    for (const k of Object.keys(row)) idx[norm(k)] = k;
    for (const name of names) {
      const key = idx[norm(name)];
      if (key) return row[key];
    }
    return '';
  };

  for (const r of dataRows) {
    const rawSku = String(pick(r, ['SKU','SKU#','SkuNumber','Product Number','ProductNumber'])).trim();
    if (!rawSku) continue;

    const skuKey = rawSku.toUpperCase(); // normalize key
    // Prefer a true Description; if missing, accept Usage-like columns
    const desc =
      String(pick(r, ['Description','Product Description','Desc'])).trim() ||
      String(pick(r, ['Usage','Use','Application','Description2','Desc2'])).trim();

    const uom  = String(pick(r, ['UOM','Unit of Measure','Units'])).trim();

    if (!map.has(skuKey)) {
      map.set(skuKey, { Description: desc, UOM: uom });
    }
  }
  return map;
}




  function updateButtonText() {
    if (!toggleButton) return;
    const isDark = body.classList.contains("dark");
    toggleButton.textContent = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
  }
});

// ✅ Build Material Break Out strictly from RAW file
function buildBreakoutFromRaw(folder) {
  const allRaw = Array.isArray(rawSheetData) ? rawSheetData : [];

  const isAlreadyNormalized =
    allRaw.length > 0 &&
    "SKU" in allRaw[0] &&
    "TotalQty" in allRaw[0] &&
    "Folder" in allRaw[0];

  const normalizedAll = isAlreadyNormalized ? allRaw : allRaw.map(normalizeRawRow);
  const scoped = folder ? normalizedAll.filter(d => d.Folder === folder) : normalizedAll;

  // Non-labor only
  const nonLaborRows = scoped.filter(d => !/labor/i.test(String(d.SKU || "")));

  // Use the configured grouping
const mode =
  BREAKOUT_GROUP_BY === "desc2"     ? "DESC2_COLOR" :
  BREAKOUT_GROUP_BY === "sku"       ? "SKU_COLOR"   :
  BREAKOUT_GROUP_BY === "desc2+sku" ? "DESC2_COLOR_SKU" :
                                      "DESC2_COLOR_SKU";

const merged = mergeForMaterialBreakout(nonLaborRows, { mode });
// Build a fallback map from the "data" array (elevation/data sheet)
// so breakouts can use a primary (long) description when Usage is blank.
// Build a fallback map from the elevation rows for THIS folder (from mergedData)
const elevationData = Array.isArray(mergedData)
  ? mergedData.filter(d => !/labor/i.test(String(d.SKU || "")) && (!folder || d.Folder === folder))
  : [];

const primaryDescBySku = new Map();
(elevationData || []).forEach(r => {
  const sku = String(r?.SKU || "").toUpperCase();
  const d   = (r?.Description && String(r.Description).trim()) || "";
  if (sku && d) primaryDescBySku.set(sku, d);
});

// expose for finalizeBreakoutForServer via window
window.primaryDescBySku = primaryDescBySku;


// ✅ Use the actual merged rows
const breakoutForServer = finalizeBreakoutForServer(merged);

// expose + debug (keep this)
window.breakoutForServer = breakoutForServer;
console.table(breakoutForServer.map(r => ({
  SKU: r.SKU,
  Description_for_B: r.Description,
  Usage_for_B_backup: r.Usage,
  Desc2_for_C: r.Description2,
  UOM: r.UOM,
  QTY: r.QTY,
  Color: r.ColorGroup
})));




  return breakoutForServer;
}




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
  const result = {};
  for (const r of normalizedRows) {
    const sku = (r.SKU || "").toString().trim().toUpperCase();
    const folder = (r.Folder || "").toString().trim();
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
        ColorGroup: colorDisplay || "",
        Vendor: r.Vendor || "",
        UnitCost: parseFloat(r.UnitCost) || 0,
        TotalQty: 0
      };
    }
    result[key].TotalQty += qty;
  }

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

   const fileNameDisplay = document.getElementById("uploadedFileName");
  if (fileNameDisplay) {
    fileNameDisplay.textContent = `📄 ${file.name}`;
    fileNameDisplay.style.display = "inline"; // ensure it's visible
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
const names = workbook.SheetNames;
    // Pick sheets robustly
    const templateName =
      names.find(n => /template/i.test(n)) ||
      names.find(n => /takeoff/i.test(n)) ||
      names[0];
   const dataName =
  names.find(n => /^data$/i.test(n)) ||
  names.find(n => /data/i.test(n)) ||
  names.find(n => /(sku|catalog|product|products|items?|lookup|reference)/i.test(n));
console.log("📑 Detected Data sheet:", dataName || "(none)");


    const templateSheet = workbook.Sheets[templateName];
    if (!templateSheet) {
      alert('Template/Takeoff sheet not found.');
      return;
    }
    const json = XLSX.utils.sheet_to_json(templateSheet, { defval: "" });

    // Flag template
    window.isTakeoffTemplate = (templateName || "").trim().toLowerCase().includes("takeoff");
    console.log("📄 Loaded sheet:", templateName, "→ isTakeoffTemplate =", window.isTakeoffTemplate);

   // 🔹 Build SKU lookup from Data sheet (if present)
if (dataName && workbook.Sheets[dataName]) {
  const dataRows = XLSX.utils.sheet_to_json(workbook.Sheets[dataName], { defval: "" });
  skuLookup = buildSkuLookupFromData(dataRows);

  // ⬇️ ADD THESE
  console.log("🔎 SKU lookup size:", skuLookup.size);
  console.log('lookup hit?', skuLookup.has('JHLSP814CP')); // use uppercased SKU
  console.log('lookup entry', skuLookup.get('JHLSP814CP'));

  try { localStorage.setItem('skuLookup', JSON.stringify([...skuLookup])); } catch {}
  console.log(`🔗 Data sheet "${dataName}" loaded. SKU entries:`, skuLookup.size);
} else {
  skuLookup = new Map();
  console.warn("⚠️ No Data sheet found; Description/UOM will fallback to row/desc2.");
}


    // ✅ Normalize ONCE for mergedData display
    const normalizedRows = json.map(normalizeRawRow);

    // ✅ Keep original raw rows for raw-based builders
    rawSheetData = json;

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
    localStorage.setItem('rawSheetData', JSON.stringify(rawSheetData));

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
    // ✅ Build Material Break Out from RAW
    const breakoutForServer = buildBreakoutFromRaw(folder);

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

    // 🔹 NEW: enforce SKU A→Z sorting on both sheets before sending
    const elevationSorted = sortBySkuAscending(elevationData);
    const breakoutSorted  = sortBySkuAscending(breakoutForServer);

    return sendToInjectionServerDualSheet(elevationSorted, breakoutSorted, folder)
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


// 🔁 Always source Material Break Out from RAW file
function injectMaterialBreakout() {
  if (!Array.isArray(rawSheetData) || !rawSheetData.length) {
    alert("No RAW data found. Please upload a source file first.");
    return;
  }

  const selected = [...document.querySelectorAll('.folder-checkbox:checked')].map(cb => cb.value);
  const allFolders = [...new Set((Array.isArray(mergedData) ? mergedData : []).map(d => d.Folder))];

  let folderForPayload = null;
  if (selected.length === 1) folderForPayload = selected[0];
  else if (allFolders.length === 1) folderForPayload = allFolders[0];

  const breakoutForServer = buildBreakoutFromRaw(folderForPayload || undefined);
  if (!breakoutForServer.length) {
    alert("Material Break Out payload is empty after filtering non-labor rows from RAW file.");
    return;
  }

  // 🔹 NEW: A→Z by SKU
  const breakoutSorted = sortBySkuAscending(breakoutForServer);

  const label = folderForPayload || "Material_Break_Out";
  sendToInjectionServer(breakoutSorted, label, "material_breakout");
  showToast(`✅ Material Break Out (RAW) injected for "${label}" (${breakoutSorted.length} items)`);
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
        ColorGroup: includeColor ? (colorDisplay || "") : (row[colMap.colorgroup] ?? ""),
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
const skipRounding = !allowRounding || isLabor || ["SQ","SQ.","SQFT","SQUARE FT"].includes(uom);

    if (!skipRounding) {
      item.TotalQty = Math.ceil(Math.abs(item.TotalQty)); // always round up
    }
    return item;
  });

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
  container.innerHTML = "";

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

    const section = document.createElement("section");

    const heading = document.createElement("h3");
    heading.textContent = folder;
    section.appendChild(heading);

    const button = document.createElement("button");
    button.classList.add("copy-button");
    button.textContent = `Copy ${folder} to Clipboard`;
    button.addEventListener('click', () => {
      console.log("🔘 Copy button clicked:", tableId);
      copyToClipboard(tableId);
    });
    section.appendChild(button);

    const textarea = document.createElement("textarea");
    textarea.id = tableId;
    textarea.style.display = "none";
    textarea.value = tsvContent.trim(); 
    section.appendChild(textarea);

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

    container.appendChild(section);
  });
}
/* ===== Loading Overlay (drop-in, no deps) ===== */
(function () {
  if (typeof window === "undefined") return;
  if (window.showLoadingOverlay) return; // already present

  // Inject CSS once
  (function injectLoadingOverlayCSSOnce() {
    if (document.getElementById("loading-overlay-styles")) return;
    const style = document.createElement("style");
    style.id = "loading-overlay-styles";
    style.textContent = `
      #loadingOverlay {
        position: fixed; inset: 0; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,.55); backdrop-filter: blur(2px);
        z-index: 2147483646;
      }
      .loading-card {
        min-width: 280px; max-width: 90vw;
        padding: 16px 18px; border-radius: 14px;
        background: var(--card, #151923);
        color: var(--text, #e9edf1);
        border: 1px solid var(--border, #232a3a);
        box-shadow: 0 12px 32px rgba(0,0,0,.35);
        display: grid; grid-template-columns: auto 1fr;
        gap: 12px; align-items: center;
      }
      .loading-left { display: grid; gap: 8px; align-items: center; }
      .loading-spinner {
        width: 24px; height: 24px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.2);
        border-top-color: currentColor;
        animation: loading-spin .9s linear infinite;
      }
      .loading-body { display: grid; gap: 8px; min-width: 220px; }
      #loadingMessage { font: 14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif; }
      .loading-progress {
        display: none; height: 8px; width: 100%;
        background: #232a3a; border-radius: 999px; overflow: hidden;
        border: 1px solid rgba(255,255,255,.08);
      }
      .loading-progress__bar {
        height: 100%; width: 0%;
        background: #34c759; transition: width .2s ease;
      }
      @keyframes loading-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  })();

  // Ensure DOM scaffold exists
  function ensureLoadingOverlayDOM() {
    let overlay = document.getElementById("loadingOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loadingOverlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `
        <div class="loading-card" role="alertdialog" aria-live="polite" aria-busy="true">
          <div class="loading-left">
            <div class="loading-spinner" aria-hidden="true"></div>
          </div>
          <div class="loading-body">
            <div id="loadingMessage">Processing...</div>
            <div class="loading-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100">
              <div class="loading-progress__bar" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  // Public API
  window.showLoadingOverlay = function (show = true, message = "Processing...") {
    const overlay = ensureLoadingOverlayDOM();
    const msgEl = overlay.querySelector("#loadingMessage");
    if (msgEl) msgEl.textContent = message ?? "";
    overlay.style.display = show ? "flex" : "none";
    overlay.setAttribute("aria-hidden", show ? "false" : "true");
  };

  window.updateLoadingOverlayMessage = function (message = "") {
    const overlay = ensureLoadingOverlayDOM();
    const msgEl = overlay.querySelector("#loadingMessage");
    if (msgEl) msgEl.textContent = message ?? "";
  };

  window.setLoadingOverlayProgress = function (percent) {
    const overlay = ensureLoadingOverlayDOM();
    const wrap = overlay.querySelector(".loading-progress");
    const bar = overlay.querySelector(".loading-progress__bar");
    if (typeof percent === "number" && isFinite(percent)) {
      const p = Math.max(0, Math.min(100, percent));
      wrap.style.display = "block";
      bar.style.width = p + "%";
      wrap.setAttribute("aria-valuenow", String(p));
    } else {
      // hide if invalid/undefined
      wrap.style.display = "none";
      bar.style.width = "0%";
      wrap.removeAttribute("aria-valuenow");
    }
  };
})();

// ✅ Disable/enable all folder-related UI controls during export
function disableAllFolderButtons(disabled, message = "") {
  // Buttons you want to lock (must have class="folder-button")
  const buttons = document.querySelectorAll('button.folder-button');

  buttons.forEach(btn => {
    if (!btn.dataset.originalLabel) {
      btn.dataset.originalLabel = btn.textContent;
    }
    btn.disabled = disabled;
    btn.textContent = disabled && message ? message : btn.dataset.originalLabel;
    btn.classList.toggle('is-disabled', disabled);
  });

  // Also lock the checkboxes so the selection can't change mid-export
  const checkboxes = document.querySelectorAll('.folder-checkbox');
  checkboxes.forEach(cb => { cb.disabled = disabled; });
}


function normalizeRawRow(row) {
  const normalizedKeys = {};
  Object.keys(row).forEach(key => {
    const keyNorm = key.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
    normalizedKeys[keyNorm] = key;
  });

  const getValue = (aliases, fallbackRegex) => {
    // 1) exact/alias match
    for (let alias of aliases) {
      const norm = alias.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
      if (normalizedKeys[norm]) return row[normalizedKeys[norm]];
    }
    // 2) regex fallback over original keys when no alias hits (e.g., "Usage (Breakout)")
    if (fallbackRegex) {
      const hit = Object.keys(row).find(k => fallbackRegex.test(k));
      if (hit) return row[hit];
    }
    return "";
  };

  const sku = getValue(["sku", "sku#", "skunumber"]);
  const desc = getValue(["description"], /(^|\b)desc(ription)?\b(?!\s*2)/i);

  // Map Usage/Desc2 variants to Description2
  const desc2 = getValue(
    ["description2", "desc2", "usage", "use", "application"],
    /(usage|use|application|desc.?2|secondary|alt(ernative)?\s*desc(ription)?)/i
  );

  // Normalize UOM (SQ variants → "SQ")
  const rawUom = getValue(["uom","unitofmeasure","units","uomlf","uom(lf)","uom_"], /(u\.?o\.?m|unit.?of.?measure|units?)/i);
  const normUom = (rawUom || "").toString().trim().toUpperCase().replace(/^SQ(FT)?\.?$/, "SQ");

  return {
    SKU: sku,
    Description: desc,
    Description2: desc2,
    UOM: normUom,
    TotalQty: parseFloat(getValue(["qty", "quantity"], /(qty|quantit(y|ies))/i)) || 0,
    ColorGroup: getValue(["colorgroup", "color"], /(color\s*group|colour)/i),
    Folder: getValue(["folder", "elevation"], /(folder|elevation)/i),
    Vendor: getValue(["vendor"], /(vendor|supplier|manufacturer|mfg)/i),
    UnitCost: parseFloat(getValue(["unitcost", "cost"], /(unit\s*cost|cost)/i)) || 0,
  };
}



function autoResizeInput(input) {
  input.style.width = '1px';
  input.style.width = input.scrollWidth + 'px';
}

document.querySelectorAll('input[type="text"], input[type="date"], input[type="number"]').forEach(input => {
  input.addEventListener('input', () => autoResizeInput(input));
  autoResizeInput(input);
});

// 🔁 FULL REPLACEMENT: renderFolderButtons (adds .folder-button to the Export button)
function renderFolderButtons() {
  const container = document.getElementById('folderButtons');
  const section = document.getElementById('elevationSection');
  if (!container || !section) return;

  container.innerHTML = '';

  // Select All toggle (not disabled by default)
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
    label.classList.add('folder-label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = folder;
    checkbox.classList.add('folder-checkbox');

    label.appendChild(checkbox);
    label.append(folder);
    checkboxRow.appendChild(label);
  });

  // Export button → mark as folder-button so it will be disabled during export
  const injectBtn = document.createElement('button');
  injectBtn.textContent = "Export Selected Folders";
  injectBtn.style.marginTop = "10px";
  injectBtn.classList.add('folder-button'); // ← important
  injectBtn.addEventListener('click', () => {
    const selected = [...document.querySelectorAll('.folder-checkbox:checked')].map(cb => cb.value);
    if (!selected.length) return alert("Please select at least one folder.");
    injectMultipleFolders(selected);
  });

  container.appendChild(injectBtn);
}


/* ===== Toast system (drop-in, no deps) ===== */
(function injectToastCSSOnce() {
  if (document.getElementById("toast-styles")) return;
  const style = document.createElement("style");
  style.id = "toast-styles";
  style.textContent = `
    .toast-container {
      position: fixed; inset-inline: 0; bottom: 16px;
      display: grid; place-items: center; gap: 8px;
      pointer-events: none; z-index: 2147483647;
    }
    .toast {
      pointer-events: auto;
      width: min(92vw, 520px);
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: start; gap: 10px;
      padding: 12px 14px; border-radius: 12px;
      background: #151923; color: #e9edf1;
      border: 1px solid #232a3a;
      box-shadow: 0 10px 30px rgba(0,0,0,.28);
      opacity: 0; transform: translateY(8px) scale(.98);
      animation: toast-in .18s ease forwards;
      font: 14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
    }
    .toast__icon { font-size: 18px; line-height: 1; margin-top: 1px; }
    .toast__msg { white-space: pre-line; word-wrap: break-word; }
    .toast__actions { display: flex; gap: 8px; margin-left: 8px; }
    .toast__btn, .toast__close {
      border: 1px solid transparent; background: transparent; color: inherit;
      padding: 6px 10px; border-radius: 10px; cursor: pointer; font: inherit;
    }
    .toast__btn:hover { background: rgba(255,255,255,.06); }
    .toast__close { padding: 4px 8px; font-weight: 700; opacity: .8 }
    .toast__close:hover { opacity: 1; background: rgba(255,255,255,.06); }
    .toast--success { border-color: #34c759; }
    .toast--error   { border-color: #ff3b30; }
    .toast--warn    { border-color: #f7b500; }
    .toast--info    { border-color: #3b82f6; }
    @keyframes toast-in { to { opacity: 1; transform: translateY(0) scale(1);} }
    @keyframes toast-out { to { opacity: 0; transform: translateY(8px) scale(.98);} }
  `;
  document.head.appendChild(style);
})();

function showToast(message, {
  type = "info",
  duration = 2600,
  actionText,
  onAction,
  dismissible = true
} = {}) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const iconByType = {
    success: "✅",
    error:   "❌",
    warn:    "⚠️",
    info:    "ℹ️"
  };
  const icon = (message && /^[✅❌⚠️ℹ️]/.test(message.trim()))
    ? "" : iconByType[type] || iconByType.info;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  const left = document.createElement("div");
  left.className = "toast__icon";
  left.textContent = icon;

  const msg = document.createElement("div");
  msg.className = "toast__msg";
  msg.textContent = message ?? "";

  const actions = document.createElement("div");
  actions.className = "toast__actions";

  if (actionText && typeof onAction === "function") {
    const btn = document.createElement("button");
    btn.className = "toast__btn";
    btn.type = "button";
    btn.textContent = actionText;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      try { onAction(); } finally { dismiss(); }
    });
    actions.appendChild(btn);
  }

  if (dismissible) {
    const close = document.createElement("button");
    close.className = "toast__close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", (e) => { e.stopPropagation(); dismiss(); });
    actions.appendChild(close);
  }

  toast.appendChild(left);
  toast.appendChild(msg);
  toast.appendChild(actions);
  container.appendChild(toast);

  let timerId = null;
  let remaining = duration;
  let startAt = Date.now();

  function startTimer() {
    if (!duration) return;
    timerId = setTimeout(dismiss, remaining);
  }
  function pauseTimer() {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
    remaining -= (Date.now() - startAt);
  }
  function resumeTimer() {
    if (!duration) return;
    startAt = Date.now();
    startTimer();
  }
  function dismiss() {
    if (timerId) clearTimeout(timerId);
    toast.style.animation = "toast-out .16s ease forwards";
    toast.addEventListener("animationend", () => {
      toast.remove();
      if (!container.children.length) container.remove();
    }, { once: true });
  }

  toast.addEventListener("mouseenter", pauseTimer);
  toast.addEventListener("mouseleave", resumeTimer);
  startTimer();

  return { element: toast, dismiss };
}

// 🔁 FULL REPLACEMENT: renderMaterialBreakoutButtons (adds .folder-button)
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
    button.classList.add('folder-button'); // ← so disableAllFolderButtons can find it
    button.addEventListener('click', () => {
      const breakoutForServer = buildBreakoutFromRaw(folder);
      if (!breakoutForServer.length) {
        showToast(`⚠️ No non-labor RAW rows for "${folder}"`);
        return;
      }
      console.log(`⬇️ On-demand breakout (RAW) for "${folder}"`, breakoutForServer.slice(0, 5));
      sendToInjectionServer(breakoutForServer, folder, "material_breakout");
      showToast(`✅ Material Break Out (RAW) injected for "${folder}" (${breakoutForServer.length} items)`);
    });
    container.appendChild(button);
  });
}

// Merge for Material Break Out with configurable grouping
function mergeForMaterialBreakout(data, options = {}) {
  const {
    mode = (BREAKOUT_GROUP_BY === "desc2"      ? "DESC2_COLOR" :
            BREAKOUT_GROUP_BY === "sku"        ? "SKU_COLOR"   :
            /* default */                        "DESC2_COLOR_SKU"),
    skipLabor = true
  } = options;

  const result = {};

  for (const row of (Array.isArray(data) ? data : [])) {
    const skuRaw = (row.SKU ?? "").toString().trim();
    if (skipLabor && /labor/i.test(skuRaw)) continue;

    const skuKey   = skuRaw.toUpperCase();
    const desc2    = (row.Description2 ?? "").toString().trim();
    const color    = (row.ColorGroup   ?? "").toString().trim();
    const hasDesc2 = desc2.length > 0;

    // Build the grouping key
    let key;
    switch (mode) {
      case "DESC2_COLOR_SKU":
        key = `${desc2}|||${color}|||${skuKey}`;            // Desc2 + Color + SKU
        break;
      case "DESC2_COLOR":
        key = hasDesc2 ? `${desc2}|||${color}`              // Desc2 + Color
                       : `${skuKey}|||${color}`;            // fallback when Desc2 empty
        break;
      case "SKU_COLOR":
      default:
        key = `${skuKey}|||${color}`;                       // SKU + Color
        break;
    }

    // Robust qty parse
    let qty = row.TotalQty;
    if (!(typeof qty === "number" && isFinite(qty))) {
      qty = parseFloat(String(qty ?? "0").replace(/[^\d.\-]/g, ""));
      if (!isFinite(qty) || isNaN(qty)) qty = 0;
    }

    if (!result[key]) {
      result[key] = {
        SKU: skuRaw,
        Description2: desc2,
        ColorGroup: color,
        UOM: row.UOM || "",       
        TotalQty: 0
      };
    }

    // Preserve a non-empty SKU if the first was empty
    if (!result[key].SKU && skuRaw) result[key].SKU = skuRaw;

    result[key].TotalQty += qty;
  }

  return Object.values(result);
}

// ✅ NEW: finalize payload for server (QTY hardening, both QTY and Qty, rounding)
// ✅ finalize payload for server (QTY hardening, case-insensitive lookups)
function finalizeBreakoutForServer(items) {
  return (items || [])
    .filter(r =>
      (r.SKU && String(r.SKU).trim()) ||
      (r.Description2 && String(r.Description2).trim()) ||
      (r.ColorGroup && String(r.ColorGroup).trim())
    )
    .map(r => {
      // qty normalize
      const src = r.TotalQty;
      let n = (typeof src === "number" && isFinite(src))
        ? src
        : parseFloat(String(src ?? "0").replace(/[^\d.\-]/g, ""));
      if (!isFinite(n) || isNaN(n)) n = 0;
      n = Math.round((n + Number.EPSILON) * 1000) / 1000;

      // lookups
      const skuRaw = String(r.SKU || "");
      const skuKey = skuRaw.toUpperCase();
      const lk = skuLookup.get(skuKey) || {};

      // sources
      const usageText = (r.Description2 && String(r.Description2).trim()) || ""; // "Usage"
      const dataDesc  =
        (lk.Description && String(lk.Description).trim()) ||
        (window.primaryDescBySku?.get(skuKey) || ""); // from elevation/data array
      const rowDesc   = (r.Description && String(r.Description).trim()) || "";

      // 🟩 Column B: prefer Data/row description, then fall back to Usage
      const descriptionOut = dataDesc || rowDesc || usageText || "";

      // 🟦 Column C: keep Usage as-is (no blanking)
      const description2Out = String(r.Description2 || "");

      const uom = (lk.UOM && String(lk.UOM).trim()) ||
                  (r.UOM && String(r.UOM).trim()) || "";

      return {
        SKU: skuRaw,
        Description: descriptionOut,   // → Column B (long name first)
        Usage: descriptionOut,         // keep if your backend maps "Usage"; harmless otherwise
        Description2: description2Out, // → Column C (Usage)
        UOM: uom,
        ColorGroup: String(r.ColorGroup || ""),
        QTY: n, Qty: n, qty: n, Quantity: n, TotalQty: n, TOTALQTY: n,
        QTY_STR: n.toFixed(2)
      };
    });
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
  const trimmedLines = lines;
  const modifiedLines = trimmedLines.map((line, index) => {
    const cols = line.split("\t");
    const sku = cols[0]?.toLowerCase();
    if (sku.includes("labor")) return null;

    while (cols.length < 6) cols.push("");
    cols[1] = ""; // Blank description
    cols[3] = ""; // Blank UOM
    const modified = cols.join("\t");
    console.log(`✅ Modified line ${index + 2}:`, modified);
    return modified;
  }).filter(Boolean);

  const finalText = modifiedLines.join("\n");

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

// 🔁 UPDATED: per-folder injection, material_breakout now uses RAW payload
function injectSelectedFolder(folder) {
  const filteredData = mergedData.filter(d => d.Folder === folder);
  if (!filteredData.length) return alert(`No data for ${folder}`);

  const isBreakout = /break\s*out/i.test(folder) || folder.toLowerCase() === "screen porch";

  if (isBreakout) {
    // ✅ Build from RAW file
    const breakoutForServer = buildBreakoutFromRaw(folder);
    if (!breakoutForServer.length) {
      return alert(`No non-labor items found for "${folder}" in the raw file.`);
    }
    // 🔹 NEW: A→Z by SKU
    const breakoutSorted = sortBySkuAscending(breakoutForServer);
    sendToInjectionServer(breakoutSorted, folder, "material_breakout");
    showToast(`✅ Material Break Out (RAW) injected for "${folder}" (${breakoutSorted.length} items)`);
    return;
  }

  // Elevation path (non-labor only)
  const nonLabor = filteredData.filter(d => !/labor/i.test(d.SKU));
  if (!nonLabor.length) {
    return alert(`No non-labor data to inject for ${folder}`);
  }

  // 🔹 NEW: A→Z by SKU
  const elevationSorted = sortBySkuAscending(nonLabor);

  sendToInjectionServer(elevationSorted, folder, "elevation");
  showToast(`✅ Sent "${folder}" to server (elevation)`);
}


function parseLaborRate(value) {
  if (!value) return null;
  const cleaned = value.toString().replace(/[^\d.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getLaborRates() {
  const laborRates = {};

  document.querySelectorAll('input[name][data-labor]').forEach(input => {
    const name = input.name;
    const parsed = parseLaborRate(input.value || "");
    if (parsed !== null && name) {
      laborRates[name] = parsed;
    }
  });

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

    const paintInput =
      document.querySelector('input[name="paintLabor"]') ||
      document.querySelector('input[name="paintlabor"]');
    metadata.paintlabor = parseLaborRate(paintInput?.value || "");

    const laborRates = getLaborRates();

    // 🔐 Ensure breakout ships every qty variant as numbers
    const hardenedBreakout = breakoutData.map(item => {
      // prefer numeric QTY already present
      let n = item.QTY;
      if (!(typeof n === "number" && isFinite(n))) {
        const cand = item.Qty ?? item.qty ?? item.Quantity ?? item.TotalQty ?? item.QTY_STR;
        n = (typeof cand === "number" && isFinite(cand))
          ? cand
          : parseFloat(String(cand ?? "0").replace(/[^\d.\-]/g, "")) || 0;
      }
      n = Math.round((n + Number.EPSILON) * 1000) / 1000;

      return {
        ...item,
        QTY: n,
        Qty: n,
        qty: n,
        Quantity: n,
        TotalQty: n,
        TOTALQTY: n,
        QTY_STR: n.toFixed(2)
      };
    });
   // ✅ Keep UOM for elevation sheet so the server can skip rounding on SQ
const elevationSanitized = (elevationData || [])
  .map(item => {
    // normalize UOM for safety (SQ, SQ., SQFT → SQ)
    const normUOM = String(item.UOM || "")
      .trim()
      .toUpperCase()
      .replace(/^SQ(FT)?\.?$/, "SQ");

    return {
      ...item,
      UOM: normUOM,
      NoRound: normUOM === "SQ"
    };
  })
  .sort((a,b) => (String(a?.SKU||'').toUpperCase()).localeCompare(String(b?.SKU||'').toUpperCase()));
 

    const hardenedBreakoutSorted = (hardenedBreakout || [])
      .sort((a,b) => (String(a?.SKU||'').toUpperCase()).localeCompare(String(b?.SKU||'').toUpperCase()));


    const payload = {
      data: elevationSanitized,         
      breakout: hardenedBreakoutSorted,  
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
                sendToInjectionServerDualSheet(elevationData, hardenedBreakout, folderName, attempt + 1)
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

        const safe = val => (val || "").toString().trim().replace(/[<>:"/\\|?*]+/g, "_");
        const elevationForFile = folderName || metadata.elevation || "";
        const fileName = `Takeoff - ${safe(metadata.builder)} - ${safe(metadata.planName)} - ${safe(elevationForFile)} - ${safe(metadata.materialType)}.xlsb`;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
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

