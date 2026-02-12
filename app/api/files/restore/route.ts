import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/paths";

// Centralized trash folder
function getTrashDir(): string {
  const dataDir = getDataDir();
  return path.join(dataDir, "data", ".trash");
}

// Restore a file from centralized trash
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalPath } = body;

    if (!originalPath) {
      return NextResponse.json({ error: "originalPath is required" }, { status: 400 });
    }

    const trashDir = getTrashDir();
    if (!fs.existsSync(trashDir)) {
      return NextResponse.json({ error: "Trash folder not found" }, { status: 404 });
    }

    // Find the file in trash (should only be one)
    const trashFiles = fs.readdirSync(trashDir);
    if (trashFiles.length === 0) {
      return NextResponse.json({ error: "Trash is empty" }, { status: 404 });
    }

    const trashPath = path.join(trashDir, trashFiles[0]);
    const normalizedOriginalPath = path.normalize(originalPath);
    
    // Move file back to original location
    fs.renameSync(trashPath, normalizedOriginalPath);
    
    return NextResponse.json({ 
      success: true, 
      restored: normalizedOriginalPath 
    });
  } catch (error) {
    console.error("Error restoring file:", error);
    return NextResponse.json({ error: "Failed to restore file" }, { status: 500 });
  }
}
