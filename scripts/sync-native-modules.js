/**
 * Syncs the electron-rebuilt native binary of better-sqlite3 from root node_modules
 * into the standalone node_modules so the Next.js standalone server can find it.
 * 
 * Used as electron-builder afterPack hook.
 */
const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  console.log("afterPack: appOutDir =", appOutDir);
  
  const resourcesApp = path.join(appOutDir, "resources", "app");
  
  const rootNative = path.join(resourcesApp, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const standaloneNative = path.join(resourcesApp, ".next", "standalone", "node_modules", "better-sqlite3", "build", "Release");
  
  if (fs.existsSync(rootNative) && fs.existsSync(standaloneNative)) {
    const dest = path.join(standaloneNative, "better_sqlite3.node");
    fs.copyFileSync(rootNative, dest);
    console.log("Synced electron-rebuilt better-sqlite3 native binary to standalone");
  } else if (fs.existsSync(rootNative)) {
    // Standalone copy was deleted (electron-packager flow) - that's fine
    console.log("No standalone better-sqlite3 to sync (electron-packager mode)");
  } else {
    console.warn("WARNING: Could not find rebuilt better-sqlite3 native binary");
  }
};
