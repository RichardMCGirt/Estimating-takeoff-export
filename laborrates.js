const predefinedLaborFields = [
  { name: "beamWrapLabor", label: "Beam Wrap Labor rate", airtableName: "Beam Wrap" },
  { name: "bbLabor", label: "B&B Labor rate", airtableName: "Board & Batten" },
  { name: "bracketLabor", label: "Bracket Labor rate", airtableName: "Brackets(Field Built)" },
  { name: "ceilingLabor", label: "Ceiling Labor rate", airtableName: "Ceilings(Premium)" },
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
  // Setup change event listeners
  document.getElementById("branchSelect").addEventListener("change", () => {
    if (areRequiredFieldsFilled()) applyLaborRatesToForm();
  });

  document.getElementById("ProjectSelect").addEventListener("change", () => {
    if (areRequiredFieldsFilled()) applyLaborRatesToForm();
  });

  document.querySelector('select[name="materialType"]')
?.addEventListener("change", () => {
    if (areRequiredFieldsFilled()) applyLaborRatesToForm();
  });

  // Optional: log material changes
  const materialInput = document.querySelector('select[name="materialType"]');
  materialInput?.addEventListener('input', () => {
    console.log('✏️ Material type changed:', materialInput.value);
  });
  materialInput?.addEventListener('change', () => {
    console.log('✅ Material type final:', materialInput.value);
  });
});


async function fetchDynamicLaborFieldMap() {
  const apiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
  const baseId = 'appTxtZtAlIdKQ7Wt';
  const tableId = 'tblGJfNIqlT0dCkUX';
  const viewId = 'viwwL0F87E2IQuaw0';

  let allRecords = [];
  let offset = null;

  try {
    do {
      const url = `https://api.airtable.com/v0/${baseId}/${tableId}?view=${viewId}` +
                  (offset ? `&offset=${offset}` : '');

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      const data = await res.json();
      allRecords = allRecords.concat(data.records);
      offset = data.offset;
    } while (offset);

    const seen = new Set();
    const map = {};

    allRecords.forEach(record => {
      const desc = record.fields.Description?.trim();
      if (desc && !seen.has(desc)) {
        seen.add(desc);
        const key = desc.replace(/[^a-zA-Z]/g, '').toLowerCase() + 'Labor';
        map[key] = desc;
      }
    });

    console.log("🧩 Full dynamic fieldMap keys:", Object.keys(map));
    return map;

  } catch (err) {
    console.error("❌ Error fetching dynamic field map:", err);
    return {};
  }
}


async function fetchLaborRatesFromAirtable() {
  const apiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
  const baseId = 'appTxtZtAlIdKQ7Wt';
  const tableId = 'tblGJfNIqlT0dCkUX';
  const viewId = 'viwwL0F87E2IQuaw0';

  const sidingStyle = document.querySelector('select[name="materialType"]')?.value?.trim();
  const branch = document.getElementById('branchSelect')?.value?.trim();
  const projectType = document.getElementById('ProjectSelect')?.value?.trim();

  console.log("🔍 Requested Siding Style:", sidingStyle);
  console.log("🔍 Requested Branch:", branch);
  console.log("🧪 Project Type:", projectType);

  if (!sidingStyle || !branch || !projectType) {
    console.warn("⚠️ Missing siding style, branch, or project type for labor rate lookup.");
    return {};
  }

  const filterFormula = `AND({Siding Style}="${sidingStyle}", {Vanir Offices}="${branch}", {Type}="${projectType}")`;
  const encodedFormula = encodeURIComponent(filterFormula);
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?view=${viewId}&filterByFormula=${encodedFormula}`;

  console.log("🔗 Airtable URL:", url);
  console.log("🧪 Raw filter formula (before encoding):", filterFormula);

  try {
    const [fieldMap, res] = await Promise.all([
      fetchDynamicLaborFieldMap(),
      fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      })
    ]);

    const data = await res.json();
    console.log("📦 Raw Airtable response:", data);

    if (!data.records || data.records.length === 0) {
      console.warn(`❌ No matching record found for Siding Style: "${sidingStyle}", Branch: "${branch}", and Project Type: "${projectType}".`);
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
  container.innerHTML = ""; // Clear previous content

  console.log("🛠 Rendering predefined inputs based on existing rates...");
  console.log("📊 LaborRates received:", laborRates);

  predefinedLaborFields.forEach(({ name, label }) => {
    const value = laborRates[name];

    const labelEl = document.createElement("label");
    labelEl.innerHTML = `
      ${label}<br>
${
  Array.isArray(value)
    ? `<select name="${name}">${value.map(
        opt => `<option value="${opt.rate}">${opt.label} - $${opt.rate.toFixed(2)}</option>`
      ).join("")}</select>`
    : `<input type="text" name="${name}" value="${!isNaN(value) ? `$${value.toFixed(2)}` : ""}" />`
}
    `;
    container.appendChild(labelEl);

    if (value && !isNaN(value)) {
      console.log(`✅ Showing ${name} with value: $${value.toFixed(2)}`);
    } else {
      console.log(`🚫 Showing ${name} with empty value (no rate returned)`);
    }
  });
}




async function applyLaborRatesToForm() {
  const rates = await fetchLaborRatesFromAirtable();
  console.log("📊 Rates returned:", rates);

  Object.entries(rates).forEach(([inputName, value]) => {
    const input = document.querySelector(`input[name="${inputName}"]`);
    if (input) {
      console.log(`💰 Setting value for ${inputName}: $${value.toFixed(2)}`);
const input = document.querySelector(`[name="${inputName}"]`);
if (input) {
  if (input.tagName === "SELECT") {
    input.selectedIndex = 0; // default to first option
    console.log(`💰 Selected ${inputName}:`, input.value);
  } else {
    input.value = `$${value.toFixed(2)}`;
    console.log(`💰 Set value for ${inputName}: $${value.toFixed(2)}`);
  }
}
    } else {
      console.warn(`⚠️ No input found for: ${inputName}`);
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

  return sidingStyle && branch && projectType;
}
