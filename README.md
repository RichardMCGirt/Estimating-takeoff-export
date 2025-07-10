
# 🚧 Vanir Estimating Tool — Live Branch: usage2

A browser-based estimating tool for **Vanir Installed Sales**. Enter project info, upload Excel file, merge SKUs, select elevations, and inject data into a macro-enabled workbook using a **Flask** server with **xlwings**, running on an **Azure VM** for secure, always-on access.

---

## ✨ Features

- **📋 Complete Estimating Form**  
  Enter Builder, Plan, Elevation, Siding Type, Date, Estimator, Branch, and Project Type.

- **💲 Labor Rates**  
  Add predefined or custom labor rates dynamically mapped to your workbook.

- **📂 Excel Upload**  
  Drag & drop or browse to upload your `.xlsx` file.

- **🔗 SKU Merging**  
  Automatically merge SKUs and quantities by elevation or folder.

- **🏠 Folder Selection**  
  Select one or more elevations/folders to process.

- **📤 Data Injection**  
  Processed data is sent via POST to your remote Flask server (`/inject`).

- **📊 xlwings Integration**  
  The server copies `plan.xlsb` and injects metadata, quantities, labor, and breakout sheets.

- **⬇️ Download Output**  
  Receive a timestamped `.xlsb` workbook.

- **🌙 Dark Mode**  
  Toggle light/dark mode — preference is saved automatically.

---

## 🗂️ Project Structure

\`\`\`
📁 project-folder/
├── index.html                 # Main frontend UI
├── style.css                  # Light mode styles
├── darkmode.css               # Dark mode styles
├── script.js                  # Merging logic, upload handlers, queue
├── form-init.js               # Labor form initialization
├── autocomplete-builder.js    # Builder autocomplete
├── autocomplete-estimator.js  # Estimator autocomplete
├── password.js                # (Optional) Auth overlay
├── plan.xlsb                  # Macro-enabled Excel template
├── local_injection_server.py  # Flask + xlwings server (runs on Azure VM)
└── README.md                  # This file
\`\`\`

---

## ⚙️ Requirements

- ✅ Python 3.x  
- ✅ Local install of Excel on the VM (required by xlwings)  
- ✅ Python packages:
  \`\`\`bash
  pip install flask flask-cors xlwings
  \`\`\`
- ✅ Hosted on an **Azure VM** for 24/7 server availability  
- ✅ Optional: [ngrok](https://ngrok.com/) for local testing/tunneling if needed

---

## 🔄 How It Works

### ✅ Frontend

1. Fill out the form fields and labor rates.
2. Upload a `.xlsx` source file — parsed in-browser with `xlsx.js`.
3. Merged data appears by elevation/folder.
4. Select folders and click **Export**.
5. Data POSTs to your remote Flask server (`http://<your-azure-vm>:5000/inject`).

### ✅ Backend (`local_injection_server.py` on Azure VM)

1. Runs a **Flask** server with `flask-cors` for cross-origin requests.
2. Locks injection requests to prevent conflicts.
3. Copies `plan.xlsb` and injects:
   - Metadata (Builder, Plan, Elevation, etc.)
   - Non-labor rows to **TakeOff Template**
   - Labor rates to mapped rows
   - Material Break Out sheet if needed
4. Saves output to the VM and triggers a secure download to the user.
5. Always-on VM ensures availability without manual starts.

---

## 📡 Example API Request

**POST** `/inject`

**Payload example:**

\`\`\`json
{
  "data": [...],
  "breakout": [...],
  "metadata": {
    "builder": "...",
    "planName": "...",
    "...": "..."
  },
  "laborRates": {
    "lapLabor": 5.00,
    "soffitLabor": 2.50
  },
  "type": "combined"
}
\`\`\`

---

## 🔗 Airtable Autocomplete Modules

This tool uses **Airtable** for dynamic autocompletion.

### ✨ What It Does

- ✅ **Fetches data from Airtable** using your API keys.
- ✅ **Populates suggestions** for:
  - **Builders** (from Client Name field)
  - **Estimators** (from Full Name field, optionally filtered by Title)
- ✅ **Supports keyboard navigation** (ArrowUp, ArrowDown, Enter).
- ✅ **Stores selected values** in \`localStorage\` for persistence.

---

## 🏁 Usage Tips

- Run \`local_injection_server.py\` on your Azure VM to handle injection.
- Use ngrok for local testing if needed, but the VM is recommended for production.
- Keep your Airtable API keys secure and out of version control.

---

**© Vanir Installed Sales — Live Branch: usage2**
