import { NextRequest, NextResponse } from "next/server";
import { getAudioDir } from "@/lib/paths";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  try {
    const sanitizedFilename = path.basename(filename);
    const filepath = path.join(getAudioDir(), sanitizedFilename);

    if (!existsSync(filepath)) {
      return NextResponse.json({ error: "Audio not found" }, { status: 404 });
    }

    const buffer = await readFile(filepath);

    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".webm": "audio/webm",
      ".ogg": "audio/ogg",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".wav": "audio/wav",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypes[ext] || "audio/webm",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to serve audio:", error);
    return NextResponse.json({ error: "Failed to serve audio" }, { status: 500 });
  }
}
