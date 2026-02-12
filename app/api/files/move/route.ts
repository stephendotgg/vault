import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Move a file to a new directory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath: sourceFilePath, destinationDir } = body;

    if (!sourceFilePath || !destinationDir) {
      return NextResponse.json({ error: "filePath and destinationDir are required" }, { status: 400 });
    }

    const normalizedSource = path.normalize(sourceFilePath);
    const normalizedDestDir = path.normalize(destinationDir);
    
    if (!fs.existsSync(normalizedSource)) {
      return NextResponse.json({ error: "Source file not found" }, { status: 404 });
    }

    const sourceStat = fs.statSync(normalizedSource);
    if (!sourceStat.isFile()) {
      return NextResponse.json({ error: "Source path is not a file" }, { status: 400 });
    }

    if (!fs.existsSync(normalizedDestDir)) {
      return NextResponse.json({ error: "Destination directory not found" }, { status: 404 });
    }

    const destStat = fs.statSync(normalizedDestDir);
    if (!destStat.isDirectory()) {
      return NextResponse.json({ error: "Destination is not a directory" }, { status: 400 });
    }

    // Build destination path
    const fileName = path.basename(normalizedSource);
    const destPath = path.join(normalizedDestDir, fileName);

    // Check if file already exists at destination
    if (fs.existsSync(destPath)) {
      return NextResponse.json({ error: "A file with that name already exists in the destination" }, { status: 409 });
    }

    // Move the file (rename works across directories on same drive, otherwise need copy+delete)
    try {
      fs.renameSync(normalizedSource, destPath);
    } catch {
      // If rename fails (cross-device), copy and delete
      fs.copyFileSync(normalizedSource, destPath);
      fs.unlinkSync(normalizedSource);
    }
    
    return NextResponse.json({ 
      success: true, 
      oldPath: normalizedSource, 
      newPath: destPath,
      destinationDir: normalizedDestDir 
    });
  } catch (error) {
    console.error("Error moving file:", error);
    return NextResponse.json({ error: "Failed to move file" }, { status: 500 });
  }
}
