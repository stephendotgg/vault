import { NextRequest, NextResponse } from "next/server";

// This endpoint handles folder selection
// In Electron, we expose the dialog via IPC, but for the web we return a message
export async function GET(request: NextRequest) {
  // Check if we're running in Electron by checking for the electron global
  // This will be called from the renderer process
  
  // Since we can't directly call Electron's dialog from the API route,
  // we'll return an indicator that the client should use the Electron IPC
  return NextResponse.json({ 
    useElectronDialog: true,
    message: "Use window.electronAPI.selectFolder() in Electron environment"
  });
}
