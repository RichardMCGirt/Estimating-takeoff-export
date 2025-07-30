(function () {

const airtableApiKe = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
const baseId2 = 'appX1Saz7wMYh4hhm';
const tableName2 = 'tblo2Z23S7fYrHhlk';
const builderFieldName = 'Client Name';
const viewId2 = 'viwov2znF05JU5xFm';

// === Fetch Builders from Airtable ===
async function fetchBuilders(offset = '') {
  let allBuilders = [];
  let nextOffset = offset;

  try {
    do {
      const url = `https://api.airtable.com/v0/${baseId2}/${tableName2}?fields[]=${encodeURIComponent(builderFieldName)}&view=${viewId2}&pageSize=100${nextOffset ? `&offset=${nextOffset}` : ''}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${airtableApiKe}` },
      });

      if (!response.ok) {
        console.error(`❌ Failed to fetch builders: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      allBuilders.push(
        ...data.records.map(r => r.fields[builderFieldName]).filter(Boolean)
      );
      nextOffset = data.offset;
    } while (nextOffset);

    return [...new Set(allBuilders)]; // Deduplicate
  } catch (err) {
    console.error("❌ Error fetching builders:", err);
    return [];
  }
}

// === Setup Builder Dropdown ===
function setupBuilderDropdown() {
  const input = document.getElementById('builderInput');
  const dropdown = document.getElementById('builderDropdown');
  const container = input.parentElement;
  container.style.position = 'relative';

  let builders = [];
  let currentIndex = -1;

  // Load from cache or Airtable
  const cached = localStorage.getItem("buildersCache");
  const cacheTime = localStorage.getItem("buildersCacheTime");
  const now = Date.now();

  if (cached && cacheTime && now - parseInt(cacheTime, 10) < 86400000) {
    builders = JSON.parse(cached);
    const saved = localStorage.getItem("builder");
    if (saved && builders.includes(saved)) input.value = saved;
  } else {
    fetchBuilders().then(data => {
      builders = data;
      localStorage.setItem("buildersCache", JSON.stringify(builders));
      localStorage.setItem("buildersCacheTime", now.toString());
      const saved = localStorage.getItem("builder");
      if (saved && builders.includes(saved)) input.value = saved;
    });
  }

  // === Typing event ===
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    dropdown.innerHTML = '';
    currentIndex = -1;

    if (!value) {
      dropdown.style.display = 'none';
      return;
    }

    const matches = builders.filter(name =>
      name.toLowerCase().includes(value)
    );

    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-item no-results">No matches found</div>`;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = '';
    dropdown.style.display = 'block';
    matches.forEach((match) => {
      const item = document.createElement('div');
      item.textContent = match;
      item.className = 'autocomplete-item';

      // Mouse select
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectItem(match);
      });

      dropdown.appendChild(item);
    });
  });

  // === Keyboard navigation ===
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0 || dropdown.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      currentIndex = (currentIndex + 1) % items.length;
      highlight(items, currentIndex);
      e.preventDefault(); // prevent page scroll
    } else if (e.key === 'ArrowUp') {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      highlight(items, currentIndex);
      e.preventDefault(); // prevent page scroll
    } else if (e.key === 'Enter' && currentIndex >= 0) {
      items[currentIndex].dispatchEvent(new MouseEvent('mousedown'));
      e.preventDefault();
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  // === Hide on blur ===
  input.addEventListener('blur', () => {
    setTimeout(() => (dropdown.style.display = 'none'), 200);
  });

  // === Highlight helper ===
  function highlight(items, index) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  // === Select helper ===
  function selectItem(value) {
    input.value = value;
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    localStorage.setItem("builder", value);
  }
}


// Init
document.addEventListener('DOMContentLoaded', setupBuilderDropdown);
})();
