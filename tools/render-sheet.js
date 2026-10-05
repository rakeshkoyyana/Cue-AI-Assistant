// Renders tools/brand-sheet.html to a PNG:  OUT=/tmp/x.png xvfb-run -a electron --no-sandbox tools/render-sheet.js
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.setPath('userData', fs.mkdtempSync('/tmp/cue-sheet-'));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1656, height: 1100, show: true });
  await w.loadFile(path.join(__dirname, 'brand-sheet.html')); await new Promise((r) => setTimeout(r, 800));
  const h = await w.webContents.executeJavaScript('document.documentElement.scrollHeight'); w.setContentSize(1656, h);
  await new Promise((r) => setTimeout(r, 600)); fs.writeFileSync(process.env.OUT, (await w.webContents.capturePage()).toPNG()); app.exit(0);
});
