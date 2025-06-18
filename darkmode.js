 const toggleButton = document.getElementById('darkModeToggle');
const body = document.body;

function updateButtonText() {
  toggleButton.textContent = body.classList.contains('dark') 
    ? 'Switch to Light Mode' 
    : 'Switch to Dark Mode';
}

// Load preference on page load
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark');
  }
  updateButtonText();
});

toggleButton.addEventListener('click', () => {
  body.classList.toggle('dark');
  localStorage.setItem('theme', body.classList.contains('dark') ? 'dark' : 'light');
  updateButtonText();
});