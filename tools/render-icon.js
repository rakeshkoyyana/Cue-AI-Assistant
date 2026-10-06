// Renders the app icon (build/icon.png, 1024×1024) from renderer/brand.js:  xvfb-run -a electron --no-sandbox tools/render-icon.js
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.setPath('userData', fs.mkdtempSync(require('os').tmpdir() + '/cue-icon-'));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 1024, height: 1024, show: true, frame: false, transparent: true, useContentSize: true });
  await w.loadFile(path.join(__dirname, 'icon.html')); await new Promise((r) => setTimeout(r, 700));
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), (await w.webContents.capturePage()).toPNG()); app.exit(0);
});
