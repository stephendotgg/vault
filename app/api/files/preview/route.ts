import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Serve file content for preview
export async function GET(request: NextRequest) {
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

    const ext = path.extname(normalizedPath).toLowerCase();
    
    // Determine content type
    const mimeTypes: Record<string, string> = {
      // Images
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      // Video
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      // Audio
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
      ".flac": "audio/flac",
      // Text
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".js": "text/javascript",
      ".ts": "text/typescript",
      ".tsx": "text/typescript",
      ".jsx": "text/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".xml": "text/xml",
      ".yaml": "text/yaml",
      ".yml": "text/yaml",
      ".log": "text/plain",
      ".csv": "text/csv",
      // PDF
      ".pdf": "application/pdf",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";
    
    // For text files, return content as text
    const textExts = [".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log", ".csv"];
    
    if (textExts.includes(ext)) {
      // Limit text preview to 100KB
      const maxSize = 100 * 1024;
      const content = fs.readFileSync(normalizedPath, "utf-8").slice(0, maxSize);
      return NextResponse.json({ 
        type: "text", 
        content,
        truncated: stat.size > maxSize 
      });
    }

    // For binary files, return the file directly
    const fileBuffer = fs.readFileSync(normalizedPath);
    
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
