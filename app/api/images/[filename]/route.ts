import { NextRequest, NextResponse } from "next/server";
import { getImagesDir } from "@/lib/paths";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// GET - serve an image file by filename
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  
  try {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(getImagesDir(), sanitizedFilename);
    
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    
    const buffer = await readFile(filepath);
    
    // Determine content type from extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to serve image:", error);
    return NextResponse.json({ error: "Failed to serve image", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
