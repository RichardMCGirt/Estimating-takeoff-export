document.addEventListener("DOMContentLoaded", () => {
  const correctPassword = "VanirEstimate4U";

  // Check if password was already saved in localStorage
  if (localStorage.getItem("vanirAuthorized") === "true") {
    return; // already authenticated
  }

  const userPassword = prompt("Please enter the password to access this page:");

  if (userPassword === correctPassword) {
    // Save success to localStorage
    localStorage.setItem("vanirAuthorized", "true");
  } else {
    // Deny access
    document.body.innerHTML = "";
    document.body.style.backgroundColor = "black";
    document.body.style.color = "white";
    document.body.style.display = "flex";
    document.body.style.alignItems = "center";
    document.body.style.justifyContent = "center";
    document.body.style.height = "100vh";
    document.body.innerHTML = "<h2>❌ Access Denied</h2>";
  }
});
