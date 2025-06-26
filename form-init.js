// Project Types
const projectTypes = [
  "-- Select a Project Type --",
  "Single Family",
  "Townhome",
  "2 Story Townhomes",
  "3 Story Townhomes"
];

const projectSelect = document.getElementById("ProjectSelect");
projectTypes.forEach(type => {
  const option = document.createElement("option");
  option.value = type === projectTypes[0] ? "" : type;
  option.textContent = type;
  projectSelect.appendChild(option);
});

// Branches
const branches = [
  "Charleston", "Charlotte", "Columbia", "Greensboro",
  "Greenville SC", "Myrtle Beach", "Raleigh", "Wilmington"
];

const branchSelect = document.getElementById("branchSelect");
const defaultBranchOption = document.createElement("option");
defaultBranchOption.value = "";
defaultBranchOption.textContent = "-- Select a Branch --";
branchSelect.appendChild(defaultBranchOption);

branches.forEach(branch => {
  const option = document.createElement("option");
  option.value = branch;
  option.textContent = branch.includes("Greenville") ? "Greenville" : branch;
  branchSelect.appendChild(option);
});

// Labor Rates
const laborFields = [
  { name: "beamWrapLabor", label: "Beam Wrap Labor rate" },
  { name: "bbLabor", label: "B&B Labor rate" },
  { name: "bracketLabor", label: "Bracket Labor rate" },
  { name: "ceilingLabor", label: "Ceiling Labor rate" },
  { name: "columnLabor", label: "Column Labor rate" },
  { name: "lapLabor", label: "Lap Labor rate" },
  { name: "louverLabor", label: "Louver Labor rate" },
  { name: "otherLabor", label: "Other Labor rate", hidden: true },
  { name: "paintLabor", label: "Paint Labor rate" },
  { name: "shakeLabor", label: "Shake Labor" },
  { name: "shutterLabor", label: "Shutter Labor rate" },
  { name: "tngCeilingLabor", label: "T&G Ceiling Labor rate" },
];

const form = document.getElementById("laborRatesForm");

laborFields.forEach(({ name, label, hidden }) => {
  const wrapper = document.createElement("label");
  wrapper.style.display = hidden ? "none" : "block";
  wrapper.innerHTML = `${label}<br><input type="text" name="${name}" />`;
  form.appendChild(wrapper);
});
// Material Types
const materialTypes = [
  "-- Select Material Type --",
  "Hard Siding",
  "Universal",
  "Vinyl"
];

const materialTypeSelect = document.getElementById("materialType");
materialTypes.forEach(type => {
  const option = document.createElement("option");
  option.value = type === materialTypes[0] ? "" : type;
  option.textContent = type;
  materialTypeSelect.appendChild(option);
});
