const airtableApiKey2 = 'patXTUS9m8os14OO1.6a81b7bc4dd88871072fe71f28b568070cc79035bc988de3d4228d52239c8238';
const baseId2 = 'appX1Saz7wMYh4hhm';
const tableName2 = 'tblo2Z23S7fYrHhlk';
const builderFieldName = 'Client Name';
const viewId2 = 'viwov2znF05JU5xFm';

async function fetchBuilders(offset = '') {
  let allBuilders = [];
  let nextOffset = offset;

  do {
    const url = `https://api.airtable.com/v0/${baseId2}/${tableName2}?fields[]=${encodeURIComponent(builderFieldName)}&view=${viewId2}${nextOffset ? `&offset=${nextOffset}` : ''}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${airtableApiKey2}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch builders: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const names = data.records.map(r => r.fields[builderFieldName]).filter(Boolean);
    allBuilders.push(...names);
    nextOffset = data.offset;
  } while (nextOffset);

  return [...new Set(allBuilders)]; 
}

function setupBuilderDropdown() {
  const input = document.getElementById('builderInput');
  const dropdown = document.getElementById('builderDropdown');
  const container = input.parentElement;

  container.style.position = 'relative';

  let builders = [];
  let currentIndex = -1;

  fetchBuilders().then(data => (builders = data));

 input.addEventListener('input', () => {
  const value = input.value.toLowerCase();
  dropdown.innerHTML = '';
  currentIndex = -1; // 🔄 Reset navigation

  if (!value) {
    dropdown.style.display = 'none';
    return;
  }

  const matches = builders.filter(name => name.toLowerCase().includes(value));
  if (matches.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  dropdown.style.display = 'block';
  matches.forEach((match) => {
    const item = document.createElement('div');
    item.textContent = match;
    item.className = 'autocomplete-item';
item.addEventListener('click', () => {
      input.value = match;
      dropdown.style.display = 'none';
      localStorage.setItem("builder", match);
    });
    dropdown.appendChild(item);
  });
});

input.addEventListener('keydown', (e) => {
  const items = dropdown.querySelectorAll('.autocomplete-item');

  if (dropdown.style.display === 'none' || items.length === 0) {
    console.log("⚠️ No visible items to navigate.");
    return;
  }

  if (e.key === 'ArrowDown') {
    currentIndex = (currentIndex + 1) % items.length;
    console.log(`⬇️ ArrowDown: currentIndex = ${currentIndex}`);
    highlight(items, currentIndex);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    console.log(`⬆️ ArrowUp: currentIndex = ${currentIndex}`);
    highlight(items, currentIndex);
    e.preventDefault();
  } else if (e.key === 'Enter' && currentIndex >= 0) {
    console.log(`⏎ Enter: Selecting "${items[currentIndex].textContent}"`);
    items[currentIndex].dispatchEvent(new MouseEvent('mousedown'));
    e.preventDefault();
  }
});

 setTimeout(() => {
  if (!dropdown.contains(document.activeElement)) {
    dropdown.style.display = 'none';
  }
}, 150);


    const saved = localStorage.getItem("builder");
  if (saved) input.value = saved;

  function highlight(items, index) {
    items.forEach((item, i) => {
      const isActive = i === index;
      item.classList.toggle('active', isActive);
      if (isActive) {
        console.log(`🔦 Highlighting "${item.textContent}" @ ${i}`);
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

} 

document.addEventListener('DOMContentLoaded', setupBuilderDropdown);
