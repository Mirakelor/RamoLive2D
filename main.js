const { app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
let win = null;
let tray = null;
const configPath = path.join(__dirname, 'config.json');
let config = {
  models: ['models/sagiri/sagiri.model.json'],
  lastModel: 'models/sagiri/sagiri.model.json'
};

function loadConfig() {
  if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  function updateTrayMenu() {
    const modelMenuItems = config.models.map(modelPath => ({
      label: path.basename(modelPath, '.model.json'),
      submenu: [
        {
          label: '切换到此模型',
          click: () => {
            config.lastModel = modelPath;
            saveConfig();
            win.webContents.send('change-model', modelPath);
          }
        },
        {
          label: '删除模型',
          enabled: modelPath !== 'models/sagiri/sagiri.model.json',
          click: () => {
            if (modelPath === config.lastModel) {
              config.lastModel = 'models/sagiri/sagiri.model.json';
              win.webContents.send('change-model', config.lastModel);
            }
            config.models = config.models.filter(m => m !== modelPath);
            saveConfig();
            updateTrayMenu();
          }
        }
      ]
    }));
    const contextMenu = Menu.buildFromTemplate([
      { label: '模型菜单', submenu: modelMenuItems },
      {
        label: '导入新模型',
        click: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Live2D Model', extensions: ['json'] }],
            title: '选择Live2D模型配置文件'
          });
          if (!result.canceled && result.filePaths.length > 0) {
            const modelPath = result.filePaths[0].replace(/\\/g, '/');
            try {
              JSON.parse(fs.readFileSync(modelPath, 'utf8'));
              if (!config.models.includes(modelPath)) {
                config.models.push(modelPath);
                config.lastModel = modelPath;
                saveConfig();
                win.webContents.send('change-model', modelPath);
                updateTrayMenu();
                dialog.showMessageBox({
                  type: 'info',
                  title: '导入成功',
                  message: `成功导入模型: ${path.basename(modelPath, '.model.json')}`
                });
              } else {
                dialog.showMessageBox({
                  type: 'warning',
                  title: '导入失败',
                  message: '该模型已在列表中'
                });
              }
            } catch (error) {
              dialog.showMessageBox({
                type: 'error',
                title: '导入错误',
                message: `模型导入失败: ${error.message}`
              });
            }
          }
        }
      },
      { type: 'separator' },
      { label: '退出', click: () => app.exit() }
    ]);
    tray.setContextMenu(contextMenu);
  }
  tray.setToolTip('Live2D Pet');
  updateTrayMenu();
}

const createWindow = () => {
  win = new BrowserWindow({
    width: 350,
    height: 350,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    resizable: false,
    movable: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    closable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  win.removeMenu();
  win.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);
  win.setTitle('');
  win.webContents.on('page-title-updated', e => e.preventDefault());
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  win.setFocusable(false);
  win.loadFile('index.html');
  win.on('closed', () => win = null);
  win.on('focus', () => win.blur());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Alt' || input.key === 'F10') event.preventDefault();
  });
  ipcMain.on('exit-app', () => {
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(0);
  });
  ipcMain.removeHandler('drag-window');
  ipcMain.on('drag-window', (event, data) => {
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      win.setPosition(x + data.deltaX, y + data.deltaY);
    }
  });
  loadConfig();
  createTray();
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('init-model', config.lastModel);
  });
};

process.on('uncaughtException', (error) => {
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
});
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    if (win) win.destroy();
    app.quit();
  });
});
app.whenReady().then(createWindow).catch(() => app.exit(0));
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});