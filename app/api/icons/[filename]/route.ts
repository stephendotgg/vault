import { NextRequest, NextResponse } from "next/server";
import { getIconsDir } from "@/lib/paths";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

// GET - serve an icon file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  
  try {
    const iconsDir = getIconsDir();
    const userIconPath = path.join(iconsDir, filename);
    const bundledIconPath = path.join(process.cwd(), "public", "icons", filename);
    const filepath = existsSync(userIconPath) ? userIconPath : bundledIconPath;

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "Icon not found" }, { status: 404 });
    }
    
    const buffer = await readFile(filepath);
    
    // Determine content type from extension
    const ext = filename.split(".").pop()?.toLowerCase();
    let contentType = "image/png";
    if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "gif") contentType = "image/gif";
    else if (ext === "webp") contentType = "image/webp";
    else if (ext === "svg") contentType = "image/svg+xml";
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to serve icon:", error);
    return NextResponse.json({ error: "Failed to serve icon" }, { status: 500 });
  }
}
