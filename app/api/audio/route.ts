import { NextRequest, NextResponse } from "next/server";
import { getAudioDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const base64 = typeof body.base64 === "string" ? body.base64.trim() : "";
    const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";

    if (!base64) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    let ext = "webm";
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) ext = "m4a";
    else if (mimeType.includes("ogg")) ext = "ogg";
    else if (mimeType.includes("wav")) ext = "wav";
    else if (mimeType.includes("mp3") || mimeType.includes("mpeg")) ext = "mp3";

    const buffer = Buffer.from(base64, "base64");

    const audioDir = getAudioDir();
    const filename = `${randomUUID()}.${ext}`;
    const filepath = path.join(audioDir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ filename, url: `/api/audio/${filename}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to upload audio:", message);
    return NextResponse.json({ error: "Failed to upload audio", details: message }, { status: 500 });
  }
}
