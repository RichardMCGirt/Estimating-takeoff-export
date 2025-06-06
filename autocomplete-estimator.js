const airtableApiKey = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
const baseId = 'appehs4OWDzGWYCrP';
const tableName = 'tblwtpHlA3CYpa02W';
const estimatorFieldName = 'Full Name';
const viewId = 'viwqRjBatOafF2syw';

async function fetchEstimators(offset = '') {
  let allEstimators = [];
  let nextOffset = offset;

  do {
    const filterFormula = `FIND("estimator", LOWER({Title}))`;
    const url = `https://api.airtable.com/v0/${baseId}/${tableName}?fields[]=${encodeURIComponent(estimatorFieldName)}&view=${viewId}&filterByFormula=${encodeURIComponent(filterFormula)}${nextOffset ? `&offset=${nextOffset}` : ''}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch estimators: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const names = data.records
      .map(record => record.fields[estimatorFieldName])
      .filter(Boolean);

    allEstimators.push(...names);
    nextOffset = data.offset;
  } while (nextOffset);

  return allEstimators;
}


function setupEstimatorAutocomplete() {
  const input = document.getElementById('estimatorInput');
  const dropdown = document.getElementById('estimatorDropdown');
  const container = input.parentElement;
  container.style.position = 'relative'; // Ensure relative parent for absolute dropdown

  let estimators = [];

  fetchEstimators().then(data => estimators = data);

  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    dropdown.innerHTML = '';

    if (!value) {
      dropdown.style.display = 'none';
      return;
    }

    const matches = estimators.filter(name =>
      name.toLowerCase().includes(value)
    );

    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.style.display = 'block';
    dropdown.style.position = 'absolute';
    dropdown.style.top = `${input.offsetTop + input.offsetHeight}px`;
    dropdown.style.left = `${input.offsetLeft}px`;
    dropdown.style.width = `${input.offsetWidth}px`;
    dropdown.style.zIndex = '10';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.maxHeight = '150px';
    dropdown.style.overflowY = 'auto';

    matches.forEach(match => {
      const item = document.createElement('div');
      item.textContent = match;
      item.className = 'autocomplete-item';
      item.style.padding = '4px 8px';
      item.style.cursor = 'pointer';

      item.addEventListener('mouseover', () => {
        item.style.backgroundColor = '#f0f0f0';
      });
      item.addEventListener('mouseout', () => {
        item.style.backgroundColor = '';
      });

      item.addEventListener('click', () => {
        input.value = match;
        dropdown.innerHTML = '';
        dropdown.style.display = 'none';
        localStorage.setItem("estimator", match);
      });

      dropdown.appendChild(item);
    });
  });

  input.addEventListener('blur', () => {
    setTimeout(() => (dropdown.style.display = 'none'), 200);
  });
}

document.addEventListener('DOMContentLoaded', setupEstimatorAutocomplete);
