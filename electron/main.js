const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;
let server;

const isDev = !app.isPackaged;
const PORT = 3000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#191919",
    titleBarStyle: "hiddenInset",
    frame: false,
    icon: path.join(__dirname, "../public/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Handle window control IPC events
  ipcMain.on("window-minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window-maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on("window-close", () => {
    mainWindow?.close();
  });

  // Load the app
  const url = `http://localhost:${PORT}`;
  
  // Wait for Next.js server to be ready
  const checkServer = () => {
    fetch(url)
      .then(() => {
        mainWindow.loadURL(url);
      })
      .catch(() => {
        setTimeout(checkServer, 500);
      });
  };

  checkServer();

  // Only open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startNextServer() {
  if (isDev) {
    // In dev mode, assume Next.js dev server is already running externally
    console.log("Development mode - expecting external Next.js server");
    return;
  }

  // In production, start the embedded server
  console.log("Starting production Next.js server...");
  process.env.NODE_ENV = "production";
  process.env.PORT = PORT.toString();
  
  const { startServer } = require("./server.js");
  server = await startServer();
}

app.whenReady().then(async () => {
  await startNextServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (server) {
    server.close();
  }
});
