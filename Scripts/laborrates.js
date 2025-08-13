let filterFormula = "";

const predefinedLaborFields = [
  { name: "beamWrapLabor", label: "Beam Wrap Labor rate", airtableName: "Beam Wrap" },
  { name: "bbLabor",       label: "B&B Labor rate",       airtableName: "Board & Batten" },
  { name: "bracketLabor",  label: "Bracket Labor rate",   airtableName: "Brackets" },

  // ⬇️ Ceiling variants covered
  {
    name: "ceilingLabor",
    label: "Ceiling Labor rate",
    airtableName: "Ceilings",
    alts: ["Ceiling", "Ceiling Labor", "zLABORCEIL"]
  },

  { name: "columnLabor",   label: "Column Labor rate",    airtableName: "Column" },
  { name: "lapLabor",      label: "Lap Labor rate",       airtableName: "Lap Siding" },
  { name: "louverLabor",   label: "Louver Labor rate",    airtableName: "Louver" },
  { name: "otherLabor",    label: "Other Labor rate",     airtableName: "Other" },
  { name: "paintLabor",    label: "Paint Labor rate",     airtableName: "Paint" },
  { name: "shakeLabor",    label: "Shake Labor",          airtableName: "Shake" },
  { name: "shutterLabor",  label: "Shutter Labor rate",   airtableName: "Shutter" },

  // ⬇️ T&G variants covered
  {
    name: "tngCeilingLabor",
    label: "T&G Ceiling Labor rate",
    airtableName: "T&G Ceiling",
    alts: ["Tongue & Groove Ceiling", "Tongue and Groove Ceiling", "T and G Ceiling", "T & G Ceiling"]
  },
];


document.addEventListener("DOMContentLoaded", () => {
  const fieldsToWatch = [
    "#branchSelect",
    "#ProjectSelect",
    'select[name="materialType"]'
  ];

  fieldsToWatch.forEach(selector => {
    const el = document.querySelector(selector);
    if (!el) return;

    el.addEventListener("change", () => {
      if (areRequiredFieldsFilled()) applyLaborRatesToForm();
    });
  });

  // Log material type changes (optional)
  const materialInput = document.querySelector('select[name="materialType"]');
  if (materialInput) {
    materialInput.addEventListener("input", () => {
    });

    materialInput.addEventListener("change", () => {
    });
  }
});

async function fetchLaborRatesFromAirtable() {
  const apiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
  const baseId = 'appTxtZtAlIdKQ7Wt';
  const tableId = 'tblGJfNIqlT0dCkUX';
  const viewId = 'viwwL0F87E2IQuaw0';
  const sidingStyle = document.querySelector('select[name="materialType"]')?.value?.trim();
  const branch = document.getElementById('branchSelect')?.value?.trim();
  const projectType = document.getElementById('ProjectSelect')?.value?.trim();


  if (sidingStyle === "Universal") {
    filterFormula = `AND(
      {Siding Style}="Universal",
      {Vanir Offices}="${branch}"
    )`;
  } else {
    filterFormula = `AND(
      FIND(" ${projectType} ", " " & {Type} & " "),
      {Siding Style}="${sidingStyle}",
      {Vanir Offices}="${branch}"
    )`;
  }

  const encodedFormula = encodeURIComponent(filterFormula);
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?view=${viewId}&filterByFormula=${encodedFormula}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    const data = await res.json();

    if (!data.records || data.records.length === 0) {
      const msg = `❌ No matching record found for Siding Style: "${sidingStyle}", Branch: "${branch}", and Project Type: "${projectType}".`;
      showToast(msg);
      return {};
    }

 // ...after you parse `data` in fetchLaborRatesFromAirtable
const laborRates = {};
const seen = new Set(); // optional: track what we matched

data.records.forEach(record => {
  const descRaw = record.fields["Description"];
  const rate = parseFloat(record.fields["Price/Rate"]);
  if (!descRaw || isNaN(rate)) return;

  const desc = descRaw.trim();
  const norm = desc.toLowerCase();

  let matched = false;

  // 1) Exact match on airtableName or any alt value
  predefinedLaborFields.forEach(({ name, airtableName, alts = [] }) => {
    const names = [airtableName, ...alts].filter(Boolean).map(s => s.toLowerCase());
    if (names.includes(norm)) {
      if (!laborRates[name]) laborRates[name] = [];
      laborRates[name].push({ label: desc, rate });
      matched = true;
      seen.add(`${name}:${desc}`);
    }
  });

  // 2) Fallback: contains-based routing for ceilings (keeps T&G distinct)
  if (!matched) {
    if (/ceiling/i.test(norm)) {
      const isTnG = /(t\s*&\s*g|tongue\s*&?\s*groove|t\s*and\s*g)/i.test(norm);
      const name = isTnG ? "tngCeilingLabor" : "ceilingLabor";
      if (!laborRates[name]) laborRates[name] = [];
      laborRates[name].push({ label: desc, rate });
      matched = true;
      seen.add(`${name}:${desc}`);
    }
  }

  if (!matched) {
    console.warn(`⚠️ Unmapped labor row from Airtable → Description="${desc}", Rate=${rate}`);
  }
});

// Apply to form
renderLaborInputs(laborRates);
return laborRates;


  } catch (err) {
    console.error("❌ Failed to fetch labor rates:", err);
    return {};
  }
}


function renderLaborInputs(laborRates) {
  const container = document.getElementById("laborRatesForm");
  container.innerHTML = "";

  // Ensure otherLabor is always an array
  if (!Array.isArray(laborRates.otherLabor)) {
    laborRates.otherLabor = [];
  }

  predefinedLaborFields.forEach(({ name, label }) => {
    const value = laborRates[name] || [];

    const wrapper = document.createElement("div");
    wrapper.classList.add("labor-field");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";

    const labelEl = document.createElement("label");
    labelEl.innerHTML = `${label}<br>`;
    wrapper.appendChild(labelEl);

    // Editable input (always present)
    const manualInput = document.createElement("input");
    manualInput.name = name;
    manualInput.placeholder = "$rate";

    if (name === "otherLabor") {
  manualInput.style.display = "none";
}

    // If only one value, set it directly in the input
    if (value.length === 1) {
      manualInput.value = `$${parseFloat(value[0].rate).toFixed(2)}`;
    }

    // If multiple options, render the dropdown
    if (value.length > 1) {
      const select = document.createElement("select");
      select.name = `${name}-preset`;

      const placeholderOption = document.createElement("option");
      placeholderOption.textContent = "-- Select Rate --";
      placeholderOption.disabled = true;
      placeholderOption.selected = true;
      select.appendChild(placeholderOption);

      value.forEach(opt => {
        const option = document.createElement("option");
        option.value = `${opt.rate}`;
        option.textContent = `${opt.label} - $${opt.rate.toFixed(2)}`;
        select.appendChild(option);
      });

      // When dropdown changes, populate the input
      select.addEventListener("change", () => {
        manualInput.value = `$${parseFloat(select.value).toFixed(2)}`;
      });

      wrapper.appendChild(select);
    }

    wrapper.appendChild(manualInput);

    // Custom input logic for 'Other Labor'
if (name === "otherLabor") {
  // Hide the default input
  manualInput.style.display = "none";

  // Create label and rate inputs
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = "Labor";
  labelInput.style.marginRight = "8px";

  const rateInput = document.createElement("input");
  rateInput.type = "number";
  rateInput.placeholder = "Rate (e.g. 45)";
  rateInput.style.marginRight = "8px";

  // Add Custom button
  const button = document.createElement("button");
  button.textContent = "Add Custom";
  button.type = "button";

  button.addEventListener("click", () => {
  const label = labelInput.value.trim();
  const rate = parseFloat(rateInput.value.trim());

  if (!label || isNaN(rate)) {
    alert("Please provide a valid label and numeric rate.");
    console.warn("❌ Invalid custom labor input: label or rate missing or not a number");
    return;
  }

  const key = label.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() + "Labor";

  if (document.querySelector(`input[name="${key}"]`)) {
    alert(`Custom labor "${label}" already exists.`);
    console.warn(`⚠️ Duplicate labor key blocked: ${key}`);
    return;
  }

  console.log(`➕ Added custom labor: "${label}" → key: "${key}", rate: $${rate.toFixed(2)}`);

  const customWrapper = document.createElement("div");
  customWrapper.classList.add("labor-field", "custom-labor-entry");

  const labelInputEl = document.createElement("input");
  labelInputEl.classList.add("custom-labor-label");
  labelInputEl.type = "text";
  labelInputEl.value = label;

  const rateInputEl = document.createElement("input");
  rateInputEl.classList.add("custom-labor-rate");
  rateInputEl.type = "number";
  rateInputEl.value = rate;
  rateInputEl.setAttribute("data-custom-labor", "true");

  // ✅ Add delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "❌ Delete";
  deleteBtn.type = "button";
  deleteBtn.style.marginLeft = "8px";

  deleteBtn.addEventListener("click", () => {
    console.log(`🗑️ Deleted custom labor: "${label}"`);
    customWrapper.remove();
  });

  customWrapper.appendChild(labelInputEl);
  customWrapper.appendChild(rateInputEl);
  customWrapper.appendChild(deleteBtn);

  wrapper.appendChild(customWrapper);

  labelInput.value = "";
  rateInput.value = "";

  console.log("📦 Custom labor entry DOM added to form.");
});


  wrapper.appendChild(labelInput);
  wrapper.appendChild(rateInput);
  wrapper.appendChild(button);
}
    container.appendChild(wrapper);
  });
}

async function applyLaborRatesToForm() {
  const rates = await fetchLaborRatesFromAirtable();

  Object.entries(rates).forEach(([inputName, value]) => {
    const input = document.querySelector(`[name="${inputName}"]`);
    if (!input) return;

    const finalRate = Array.isArray(value) ? value[0]?.rate : value;
    if (isNaN(finalRate)) return;

    const formattedRate = `$${parseFloat(finalRate).toFixed(2)}`;
    const currentValue = input.value?.trim();

    // Only set the value if it's empty or matches the formatted rate
    if (!currentValue || currentValue === "" || currentValue === formattedRate) {
      input.value = formattedRate;
    } else {
    }
  });
}

// Auto-apply when branch changes
document.getElementById("branchSelect").addEventListener("change", applyLaborRatesToForm);

// Prevent form reset
document.querySelector("form")?.addEventListener("submit", function (e) {
  e.preventDefault();
});

function areRequiredFieldsFilled() {
  const sidingStyle = document.querySelector('select[name="materialType"]')?.value?.trim();
  const branch = document.getElementById('branchSelect')?.value?.trim();
  const projectType = document.getElementById('ProjectSelect')?.value?.trim();

  // Project type is not required if siding style is Universal
  if (sidingStyle === "Universal") {
    return sidingStyle && branch;
  }

  return sidingStyle && branch && projectType;
}

function getLaborRates() {
  const laborRates = {};

  // Handle all predefined fields (lapLabor, ceilingLabor, etc.)
  predefinedLaborFields.forEach(({ name }) => {
    const input = document.querySelector(`input[name="${name}"]`);
    if (input) {
      const parsed = parseLaborRate(input.value);
      if (parsed !== null) laborRates[name] = parsed;
    }
  });

  // Handle dynamically added custom label + rate pairs
  document.querySelectorAll(".custom-labor-entry").forEach(wrapper => {
    const labelInput = wrapper.querySelector(".custom-labor-label");
    const rateInput = wrapper.querySelector(".custom-labor-rate");
    const label = labelInput?.value?.trim();
    const rate = parseLaborRate(rateInput?.value);

    if (label && rate !== null) {
      const key = label.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() + "Labor";
      laborRates[key] = rate;
    }
  });

  return laborRates;
}

function addCustomLaborInput(labelText, fieldName, defaultValue = "") {
  const container = document.getElementById("laborRatesForm");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("labor-input-row");

  const label = document.createElement("label");
  label.textContent = labelText;
  label.setAttribute("for", fieldName);

  const input = document.createElement("input");
  input.type = "text";
  input.name = fieldName; // required
  input.setAttribute("data-custom-labor", "true"); // required
  input.value = defaultValue;

  input.addEventListener("input", () => {
    console.log(`📝 ${fieldName} updated → ${input.value}`);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  container.appendChild(wrapper);
}
