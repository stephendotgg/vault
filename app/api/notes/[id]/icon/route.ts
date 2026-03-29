import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIconsDir } from "@/lib/paths";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { existsSync } from "fs";

// POST - upload a custom icon for a note (uses base64 JSON for simplicity in local Electron app)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const { base64, ext, mimeType } = await request.json();
    
    if (!base64 || !ext) {
      return NextResponse.json({ error: "Missing base64 or ext" }, { status: 400 });
    }
    
    // Validate file type
    if (!mimeType || !mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    
    // Verify note exists
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    
    // Get the icons directory (creates if needed)
    const iconsDir = getIconsDir();
    
    // If note already has a custom icon, delete the old file
    if (note.icon && note.icon.startsWith("icon:")) {
      const oldFilename = note.icon.substring(5);
      const oldPath = path.join(iconsDir, oldFilename);
      if (existsSync(oldPath)) {
        await unlink(oldPath);
      }
    }
    
    // Generate unique filename and write file
    const filename = `${randomUUID()}.${ext}`;
    const filepath = path.join(iconsDir, filename);
    
    // Decode base64 and write to disk
    const buffer = Buffer.from(base64, "base64");
    await writeFile(filepath, buffer);
    
    // Update note with icon reference (prefix with "icon:" to distinguish from emoji)
    const updatedNote = await prisma.note.update({
      where: { id },
      data: { icon: `icon:${filename}` },
    });
    
    return NextResponse.json({ icon: updatedNote.icon }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload icon:", error);
    return NextResponse.json({ error: "Failed to upload icon", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// DELETE - remove custom icon and reset to default emoji
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    
    // Delete the icon file if it exists
    if (note.icon.startsWith("icon:")) {
      const filename = note.icon.substring(5);
      const iconsDir = getIconsDir();
      const filepath = path.join(iconsDir, filename);
      if (existsSync(filepath)) {
        await unlink(filepath);
      }
    }
    
    // Reset to default emoji
    const updatedNote = await prisma.note.update({
      where: { id },
      data: { icon: "📄" },
    });
    
    return NextResponse.json({ icon: updatedNote.icon });
  } catch (error) {
    console.error("Failed to delete icon:", error);
    return NextResponse.json({ error: "Failed to delete icon", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
