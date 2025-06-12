const airtableApiKey1 = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
const baseId1 = 'appehs4OWDzGWYCrP';
const tableName1 = 'tblwtpHlA3CYpa02W';
const estimatorFieldName1 = 'Full Name';
const viewId1 = 'viwqRjBatOafF2syw';

async function fetchEstimators(offset = '') {
  let allEstimators = [];
  let nextOffset = offset;

  do {
    const filterFormula = `FIND("estimator", LOWER({Title}))`;
    const url = `https://api.airtable.com/v0/${baseId1}/${tableName1}?fields[]=${encodeURIComponent(estimatorFieldName1)}&view=${viewId1}&filterByFormula=${encodeURIComponent(filterFormula)}${nextOffset ? `&offset=${nextOffset}` : ''}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey1}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch estimators: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const names = data.records
      .map(record => record.fields[estimatorFieldName1])
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
  container.style.position = 'relative';

  let estimators = [];
  let currentIndex = -1;

  fetchEstimators().then(data => {
    estimators = data;
    const saved = localStorage.getItem("estimator");
    if (saved && estimators.includes(saved)) {
      input.value = saved;
    }
  });

  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    dropdown.innerHTML = '';
    currentIndex = -1;

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

    matches.forEach((match) => {
      const item = document.createElement('div');
item.textContent = match === "Heath Kornegay" ? "Nice Guy" : match;
      item.className = 'autocomplete-item';
      item.style.padding = '4px 8px';
      item.style.cursor = 'pointer';

      item.addEventListener('mouseover', () => {
        item.style.backgroundColor = '#f0f0f0';
      });
      item.addEventListener('mouseout', () => {
        item.style.backgroundColor = '';
      });

    item.addEventListener('mousedown', () => {
  const finalValue = match === "Heath Kornegay" ? "Heath Kornegay" : match;
  input.value = finalValue;
  dropdown.innerHTML = '';
  dropdown.style.display = 'none';
  localStorage.setItem("estimator", finalValue);
});


      dropdown.appendChild(item);
    });
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      currentIndex = (currentIndex + 1) % items.length;
      highlight(items, currentIndex);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      highlight(items, currentIndex);
      e.preventDefault();
    } else if (e.key === 'Enter' && currentIndex >= 0) {
      items[currentIndex].dispatchEvent(new MouseEvent('mousedown'));
      e.preventDefault();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => (dropdown.style.display = 'none'), 200);
  });

  function highlight(items, index) {
    items.forEach((item, i) => {
      const isActive = i === index;
      item.classList.toggle('active', isActive);
      if (isActive) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', setupEstimatorAutocomplete);
