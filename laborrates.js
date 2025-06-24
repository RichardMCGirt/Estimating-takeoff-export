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

  if (!sidingStyle && !branch && !projectType) {
    console.warn("⚠️ All filters are missing. Cannot search labor rates.");
    return {};
  }

  const filterParts = [];
  if (sidingStyle) filterParts.push(`{Siding Style}="${sidingStyle}"`);
  if (branch) filterParts.push(`{Vanir Offices}="${branch}"`);
  if (projectType) filterParts.push(`FIND(" ${projectType} ", " " & {Type} & " ")`);

  const relaxedFormula = `OR(${filterParts.join(",")})`;
  const encodedFormula = encodeURIComponent(relaxedFormula);
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}?view=${viewId}&filterByFormula=${encodedFormula}`;

  console.log("🔗 Airtable URL:", url);
  console.log("🧪 Relaxed filter formula:", relaxedFormula);

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
      showToast(`❌ No labor rates found for provided filters.`);
      return {};
    }

    // Score each match
    const scored = data.records.map(rec => {
      const f = rec.fields;
      let score = 0;
      if (f["Siding Style"] === sidingStyle) score++;
      if (f["Vanir Offices"] === branch) score++;
      if ((f["Type"] || '').includes(projectType)) score++;
      return { record: rec, score };
    });

    // Sort by best match (score descending)
    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0];

    if (bestMatch.score < 2) {
      showToast(`⚠️ Only partial match found. Showing closest available labor rate.`);
    }

    return bestMatch.record.fields;

  } catch (error) {
    console.error("❌ Error fetching labor rates:", error);
    showToast("Error fetching labor rates. Please try again later.");
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
const filledFields = [sidingStyle, branch, projectType].filter(Boolean);

  console.log("🔍 Requested Siding Style:", sidingStyle);
  console.log("🔍 Requested Branch:", branch);
  console.log("🧪 Project Type:", projectType);


if (filledFields.length < 2) {
  console.warn("⚠️ At least two of siding style, branch, or project type must be provided.");
  showToast("⚠️ Please select at least two filters to look up labor rates.");
  return {};
}


const filterFormula = `AND(
  FIND(" ${projectType} ", " " & {Type} & " "),
  {Siding Style}="${sidingStyle}",
  {Vanir Offices}="${branch}"
)`;
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

    const labelEl = document.createElement("label");
    labelEl.innerHTML = `${label}<br>`;
    wrapper.appendChild(labelEl);

    // Editable input (always present)
    const manualInput = document.createElement("input");
    manualInput.name = name;
    manualInput.placeholder = "$rate";

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
      const customInput = document.createElement("input");
      customInput.type = "text";
      customInput.placeholder = "Custom label - $rate";

      const button = document.createElement("button");
      button.textContent = "Add Custom";
      button.type = "button";

      button.addEventListener("click", () => {
        const inputVal = customInput.value.trim();
        console.log("✏️ Custom input value:", inputVal);

        const match = inputVal.match(/(.+)\s*-\s*\$(\d+(\.\d+)?)/);
        if (match) {
          const label = match[1].trim();
          const rate = parseFloat(match[2]);

          // Create input for custom labor
          const customWrapper = document.createElement("div");
          customWrapper.classList.add("labor-field");

          const labelElement = document.createElement("label");
          labelElement.textContent = `${label} Labor:`;
          customWrapper.appendChild(labelElement);

          const input = document.createElement("input");
          input.name = label.toLowerCase().replace(/\s+/g, '');
          input.setAttribute("data-custom-labor", "true");
          input.value = `$${rate.toFixed(2)}`;
          input.placeholder = "$rate";

          customWrapper.appendChild(input);
          wrapper.appendChild(document.createElement("br"));
          wrapper.appendChild(customWrapper);

          customInput.value = "";
          console.log(`✅ Added custom input: ${label} → $${rate}`);
        } else {
          console.warn("⚠️ Invalid format. Expected 'Label - $Rate'");
          alert("Please use format: Label - $Rate");
        }
      });

      wrapper.appendChild(document.createElement("br"));
      wrapper.appendChild(customInput);
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

  return sidingStyle && branch && projectType;
}
function showToast(message, duration = 3000) {
  // Remove existing toast if present
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.textContent = message;

  // Style the toast
  Object.assign(toast.style, {
    position: "fixed",
top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#d9534f", 
    color: "white",
    padding: "12px 24px",
    borderRadius: "8px",
    fontSize: "14px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    zIndex: 9999,
    opacity: 1,
    transition: "opacity 0.5s ease"
  });

  document.body.appendChild(toast);

  // Auto-hide after `duration` ms
 setTimeout(() => {
  console.log("👋 Fading out toast");
  toast.style.opacity = "0";
  setTimeout(() => {
    console.log("🧹 Removing toast from DOM");
    toast.remove();
  }, 500);
}, duration);

}

