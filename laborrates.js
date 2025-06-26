let filterFormula = "";

const predefinedLaborFields = [
  { name: "beamWrapLabor", label: "Beam Wrap Labor rate", airtableName: "Beam Wrap" },
  { name: "bbLabor", label: "B&B Labor rate", airtableName: "Board & Batten" },
  { name: "bracketLabor", label: "Bracket Labor rate", airtableName: "Brackets" },
  { name: "ceilingLabor", label: "Ceiling Labor rate", airtableName: "Ceilings" },
  { name: "columnLabor", label: "Column Labor rate", airtableName: "Column" },
  { name: "lapLabor", label: "Lap Labor rate", airtableName: "Lap Siding" },
  { name: "louverLabor", label: "Louver Labor rate", airtableName: "Louver" },
  { name: "otherLabor", label: "Other Labor rate", airtableName: "Other" },
  { name: "paintLabor", label: "Paint Labor rate", airtableName: "Paint" },
  { name: "shakeLabor", label: "Shake Labor", airtableName: "Shake" },
  { name: "shutterLabor", label: "Shutter Labor rate", airtableName: "Shutter" },
  { name: "tngCeilingLabor", label: "T&G Ceiling Labor rate", airtableName: "T&G Ceiling" },
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

  // Optional: log material type changes
  const materialInput = document.querySelector('select[name="materialType"]');
  if (materialInput) {
    materialInput.addEventListener("input", () => {
      console.log("✏️ Material type changed:", materialInput.value);
    });

    materialInput.addEventListener("change", () => {
      console.log("✅ Material type final:", materialInput.value);
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
const filledFields = [sidingStyle, branch, projectType].filter(Boolean);

if (!sidingStyle || !branch) {
  showToast("⚠️ Please select both office and siding style to look up labor rates.");
  return {};
}

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

  console.log("🔗 Airtable URL:", url);
  console.log("🧪 Raw filter formula (before encoding):", filterFormula);

  try {
 const res = await fetch(url, {
  headers: { Authorization: `Bearer ${apiKey}` }
});

    const data = await res.json();
    console.log("📦 Raw Airtable response:", data);

   if (!data.records || data.records.length === 0) {
  const msg = `❌ No matching record found for Siding Style: "${sidingStyle}", Branch: "${branch}", and Project Type: "${projectType}".`;
  showToast(msg); // 👈 NEW
  return {};
}

    const laborRates = {};

    data.records.forEach(record => {
      const desc = record.fields["Description"]?.trim();
      const rate = parseFloat(record.fields["Price/Rate"]);
      if (!desc || isNaN(rate)) return;

predefinedLaborFields.forEach(({ name, airtableName }) => {
 if (desc.includes(airtableName) && !isNaN(rate)) {
  if (!laborRates[name]) laborRates[name] = [];
  laborRates[name].push({ label: desc, rate });
}
});
    });

    renderLaborInputs(laborRates); // ✅ Use after laborRates is defined

    return laborRates;

  } catch (err) {
    console.error("❌ Failed to fetch labor rates:", err);
    return {};
  }
}

function renderLaborInputs(laborRates) {
  const container = document.getElementById("laborRatesForm");
  container.innerHTML = "";

  console.log("🛠 Rendering predefined inputs...");
  console.log("📊 LaborRates received:", laborRates);

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
      return;
    }

    const key = label.replace(/\s+/g, "").toLowerCase() + "Labor";

    // ✅ Prevent duplicates
    if (laborRates.hasOwnProperty(key)) {
      alert(`Custom labor "${label}" already exists.`);
      return;
    }

    // ✅ Add to laborRates
    laborRates[key] = rate;

    // Create custom input field
    const customWrapper = document.createElement("div");
    customWrapper.classList.add("labor-field");

    const labelEl = document.createElement("label");
    labelEl.textContent = `${label} Labor:`;
    customWrapper.appendChild(labelEl);

    const input = document.createElement("input");
    input.name = key;
    input.setAttribute("data-custom-labor", "true");
    input.placeholder = "$rate";
    input.value = `$${rate.toFixed(2)}`;
    customWrapper.appendChild(input);

    wrapper.appendChild(document.createElement("br"));
    wrapper.appendChild(customWrapper);

    // Clear input fields
    labelInput.value = "";
    rateInput.value = "";

    console.log(`✅ Added custom labor "${label}" at $${rate}`);
  });

  wrapper.appendChild(labelInput);
  wrapper.appendChild(rateInput);
  wrapper.appendChild(button);
}

    container.appendChild(wrapper);
  });

  console.log("✅ Finished rendering all labor rate fields");
}

async function applyLaborRatesToForm() {
  const rates = await fetchLaborRatesFromAirtable();
  console.log("📊 Rates returned:", rates);
Object.entries(rates).forEach(([inputName, value]) => {
  const input = document.querySelector(`[name="${inputName}"]`);

  // ✅ If it's an array, grab the first rate
  let finalRate = Array.isArray(value) ? value[0]?.rate : value;

 if (input && !isNaN(finalRate)) {
  const currentValue = input.value?.trim();
  const formattedRate = `$${parseFloat(finalRate).toFixed(2)}`;

  if (!currentValue || currentValue === "" || currentValue === formattedRate) {
    input.value = formattedRate;
    console.log(`💰 Set value for ${inputName}: ${formattedRate}`);
  } else {
    console.log(`✏️ Skipped overwriting ${inputName}; user entered: ${currentValue}`);
  }
}
});
}

// Auto-apply when branch changes
document.getElementById("branchSelect").addEventListener("change", applyLaborRatesToForm);

// Prevent form reset
document.querySelector("form")?.addEventListener("submit", function (e) {
  e.preventDefault();
});

// Log material type input
document.addEventListener("DOMContentLoaded", () => {
  const materialInput = document.querySelector('select[name="materialType"]');
  materialInput?.addEventListener('input', () => {
    console.log('✏️ Material type changed:', materialInput.value);
  });
  materialInput?.addEventListener('change', () => {
    console.log('✅ Material type final:', materialInput.value);
  });
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

function addCustomLaborField(label = "", rate = "") {
  const container = document.getElementById("customLaborFields");
  const wrapper = document.createElement("div");
  wrapper.className = "custom-labor-entry";
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";
  wrapper.style.marginBottom = "6px";

  // Label input
  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.placeholder = "Labor Label (e.g. Framing)";
  labelInput.className = "custom-labor-label";
  labelInput.value = label;

  // Rate input
  const rateInput = document.createElement("input");
  rateInput.type = "number";
  rateInput.placeholder = "Rate";
  rateInput.className = "custom-labor-rate";
  rateInput.value = rate;

  wrapper.appendChild(labelInput);
  wrapper.appendChild(rateInput);
  container.appendChild(wrapper);
}
