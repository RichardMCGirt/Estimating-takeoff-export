const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(cors());

const outputDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// ✅ Handle merged-data-*.json from UI
app.post('/inject-xlsb', upload.single('data'), (req, res) => {
  const jsonFile = req.file;
  if (!jsonFile) return res.status(400).send("❌ Missing file.");

  const jsonPath = path.resolve(jsonFile.path);
  const folderName = path.basename(jsonFile.originalname).replace(/^merged-data-/, '').replace(/\.json$/, '') || 'output';
  const outputFilename = `${folderName}_Takeoff.xlsb`;
  const outputPath = path.join(outputDir, outputFilename);

  const py = spawn('C:\\Users\\Richard McGirt\\AppData\\Local\\Programs\\Python\\Python311\\python.exe', ['inject_xlsb.py', jsonPath]);

  let stdout = '';
  py.stdout.on('data', (data) => stdout += data.toString());
  py.stderr.on('data', (data) => console.error(data.toString()));

  py.on('close', (code) => {
    fs.unlinkSync(jsonPath);
    if (code === 0) {
      console.log(stdout.trim());
      res.send({ message: "✅ Done", filename: outputFilename });
    } else {
      res.status(500).send("❌ Python script failed.");
    }
  });
});

// ✅ Dynamic download route
app.get('/download-xlsb/:filename', (req, res) => {
  const file = req.params.filename;
  const outputPath = path.join(outputDir, file);

  if (!fs.existsSync(outputPath)) {
    return res.status(404).send("❌ XLSB not found.");
  }

  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.binary.macroEnabled.12');
  res.sendFile(outputPath);
});

app.listen(3001, () => {
  console.log("🚀 Server running at http://localhost:3001");
});
