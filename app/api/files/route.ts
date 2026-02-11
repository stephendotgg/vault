import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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
        
        let type = "unknown";
        if (imageExts.includes(ext)) type = "image";
        else if (videoExts.includes(ext)) type = "video";
        else if (audioExts.includes(ext)) type = "audio";
        else if (textExts.includes(ext)) type = "text";
        else if (pdfExts.includes(ext)) type = "pdf";
        
        return {
          name: entry.name,
          path: filePath,
          size: stats.size,
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
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");

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

    fs.unlinkSync(normalizedPath);
    
    return NextResponse.json({ success: true, deleted: normalizedPath });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
