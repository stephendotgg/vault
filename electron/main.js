const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let nextServer;

const isDev = process.env.NODE_ENV === "development";
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

  if (isDev) {
    checkServer();
    mainWindow.webContents.openDevTools();
  } else {
    checkServer();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startNextServer() {
  if (isDev) {
    // In dev mode, assume Next.js dev server is already running
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    nextServer = spawn("npm", ["run", "start"], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      env: { ...process.env, PORT: PORT.toString() },
    });

    nextServer.stdout.on("data", (data) => {
      console.log(`Next.js: ${data}`);
      if (data.toString().includes("Ready")) {
        resolve();
      }
    });

    nextServer.stderr.on("data", (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    // Fallback resolve after 5 seconds
    setTimeout(resolve, 5000);
  });
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
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextServer) {
    nextServer.kill();
  }
});
