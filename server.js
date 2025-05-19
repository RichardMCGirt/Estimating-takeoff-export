const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' }); // Save uploaded files to disk
app.use(cors());

const outputDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// ✅ Final /upload-and-inject route (uses inject_xlsb.py)
app.post('/upload-and-inject', upload.fields([
  { name: 'jsonFile', maxCount: 1 },
  { name: 'xlsbFile', maxCount: 1 }
]), (req, res) => {
  const jsonFile = req.files['jsonFile']?.[0];
  const xlsbFile = req.files['xlsbFile']?.[0];

  if (!jsonFile || !xlsbFile) {
    return res.status(400).send("❌ Missing one or both files.");
  }

  const jsonPath = path.resolve(jsonFile.path);
  const xlsbPath = path.resolve(xlsbFile.path);
  const outputPath = path.resolve(outputDir, 'Updated_Macro_Template.xlsb');

  const py = spawn('python', ['inject_xlsb.py', jsonPath, xlsbPath, outputPath]);

  let stdout = '';
  py.stdout.on('data', (data) => stdout += data.toString());
  py.stderr.on('data', (data) => console.error(data.toString()));

  py.on('close', (code) => {
    if (code === 0) {
      res.send("✅ Injection complete and saved.");
    } else {
      res.status(500).send("❌ Python script failed.");
    }

    fs.unlinkSync(jsonPath);
    fs.unlinkSync(xlsbPath);
  });
});

// ✅ /download-xlsb to fetch result
app.get('/download-xlsb', (req, res) => {
  const outputPath = path.resolve(outputDir, 'Updated_Macro_Template.xlsb');
  if (!fs.existsSync(outputPath)) {
    return res.status(404).send("❌ No XLSB file has been generated yet.");
  }

  res.setHeader('Content-Disposition', 'attachment; filename=Updated_Macro_Template.xlsb');
  res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.binary.macroEnabled.12');
  res.sendFile(outputPath);
});

app.listen(3001, () => {
  console.log("🚀 Server running at http://localhost:3001");
});
