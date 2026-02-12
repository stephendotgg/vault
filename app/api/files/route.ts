import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import trash from "trash";
import { getDataDir } from "@/lib/paths";

// Centralized trash folder in app data
function getTrashDir(): string {
  const dataDir = getDataDir();
  const trashDir = path.join(dataDir, "data", ".trash");
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir, { recursive: true });
  }
  return trashDir;
}

// Get files in a directory
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get("path");

  if (!dirPath) {
    return NextResponse.json({ error: "Path is required" }, { status: 400 });
  }

  try {
    // Normalize and validate path
    const normalizedPath = path.normalize(dirPath);
    
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }

    const stat = fs.statSync(normalizedPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const entries = fs.readdirSync(normalizedPath, { withFileTypes: true });
    
    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => {
        const filePath = path.join(normalizedPath, entry.name);
        const stats = fs.statSync(filePath);
        const ext = path.extname(entry.name).toLowerCase();
        
        // Determine file type for preview
        const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
        const videoExts = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
        const audioExts = [".mp3", ".wav", ".ogg", ".m4a", ".flac"];
        const textExts = [".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log", ".csv"];
        const pdfExts = [".pdf"];
        const archiveExts = [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"];
        
        let type = "unknown";
        if (imageExts.includes(ext)) type = "image";
        else if (videoExts.includes(ext)) type = "video";
        else if (audioExts.includes(ext)) type = "audio";
        else if (textExts.includes(ext)) type = "text";
        else if (pdfExts.includes(ext)) type = "pdf";
        else if (archiveExts.includes(ext)) type = "archive";
        
        // birthtime may not be available on all systems, fall back to mtime
        const createdTime = stats.birthtime && stats.birthtime.getTime() > 0 
          ? stats.birthtime 
          : stats.mtime;
        
        return {
          name: entry.name,
          path: filePath,
          size: stats.size,
          created: createdTime.toISOString(),
          modified: stats.mtime.toISOString(),
          type,
          ext,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ 
      path: normalizedPath,
      files,
      totalCount: files.length 
    });
  } catch (error) {
    console.error("Error reading directory:", error);
    return NextResponse.json({ error: "Failed to read directory" }, { status: 500 });
  }
}

// Delete a file
// If isLastFile=true, send straight to Recycle Bin (no undo)
// Otherwise, move to centralized trash for one-time undo
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const isLastFile = searchParams.get("isLastFile") === "true";

  if (!filePath) {
    return NextResponse.json({ error: "Path is required" }, { status: 400 });
  }

  try {
    const normalizedPath = path.normalize(filePath);
    
    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(normalizedPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    // If last file, send directly to Recycle Bin
    if (isLastFile) {
      await trash(normalizedPath);
      return NextResponse.json({ 
        success: true, 
        deleted: normalizedPath,
        trashPath: null // No undo available
      });
    }

    // Get centralized trash dir
    const trashDir = getTrashDir();
    
    // Clear any existing file in trash (only keep one)
    const existingTrash = fs.readdirSync(trashDir);
    for (const file of existingTrash) {
      const existingPath = path.join(trashDir, file);
      // Send old trash to Recycle Bin
      await trash(existingPath);
    }

    // Move new file to trash
    const fileName = path.basename(normalizedPath);
    const trashPath = path.join(trashDir, fileName);
    fs.renameSync(normalizedPath, trashPath);
    
    return NextResponse.json({ 
      success: true, 
      deleted: normalizedPath,
      trashPath: trashPath 
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}

// Rename a file
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldPath, newName } = body;

    if (!oldPath || !newName) {
      return NextResponse.json({ error: "oldPath and newName are required" }, { status: 400 });
    }

    const normalizedOldPath = path.normalize(oldPath);
    
    if (!fs.existsSync(normalizedOldPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(normalizedOldPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    // Build new path with new name in same directory
    const dir = path.dirname(normalizedOldPath);
    const newPath = path.join(dir, newName);

    // Check if new path already exists
    if (fs.existsSync(newPath)) {
      return NextResponse.json({ error: "A file with that name already exists" }, { status: 409 });
    }

    fs.renameSync(normalizedOldPath, newPath);
    
    return NextResponse.json({ success: true, oldPath: normalizedOldPath, newPath, newName });
  } catch (error) {
    console.error("Error renaming file:", error);
    return NextResponse.json({ error: "Failed to rename file" }, { status: 500 });
  }
}
