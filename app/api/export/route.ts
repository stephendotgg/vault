import { NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { getDataDir } from "@/lib/paths";
import path from "path";
import { existsSync } from "fs";

export async function GET() {
  try {
    const dataDir = getDataDir();
    const dataPath = path.join(dataDir, "data");
    
    if (!existsSync(dataPath)) {
      return NextResponse.json({ error: "No data folder found" }, { status: 404 });
    }

    // Create a pass-through stream
    const passThrough = new PassThrough();
    
    // Create archive
    const archive = archiver("zip", {
      zlib: { level: 9 } // Maximum compression
    });

    // Pipe archive to passthrough
    archive.pipe(passThrough);

    // Add the data folder contents
    archive.directory(dataPath, "data");

    // Finalize the archive
    archive.finalize();

    // Convert stream to response
    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `mothership-backup-${timestamp}.zip`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to create backup" }, { status: 500 });
  }
}
