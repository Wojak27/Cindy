const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration(); // also rules out GPU crashes
app.whenReady().then(() => {
    const w = new BrowserWindow({ width: 800, height: 600 });
    w.loadURL('data:text/html,<h1>ok</h1>');
});