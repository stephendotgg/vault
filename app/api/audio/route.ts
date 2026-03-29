import { NextRequest, NextResponse } from "next/server";
import { getAudioDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    let buffer: Buffer;
    let ext = "webm";

    // Try formData first (most common from browser MediaRecorder)
    try {
      const formData = await request.formData();
      const file = formData.get("audio") as Blob | null;

      if (file) {
        const type = (file.type || "").toLowerCase();
        if (type.includes("mp4") || type.includes("m4a")) ext = "m4a";
        else if (type.includes("ogg")) ext = "ogg";
        else if (type.includes("wav")) ext = "wav";
        else if (type.includes("mp3") || type.includes("mpeg")) ext = "mp3";

        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        return NextResponse.json({ error: "No audio provided" }, { status: 400 });
      }
    } catch {
      // FormData parsing failed — try JSON
      const body = await request.json();
      const base64 = typeof body.base64 === "string" ? body.base64.trim() : "";
      const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";

      if (!base64) {
        return NextResponse.json({ error: "No audio provided" }, { status: 400 });
      }

      if (mimeType.includes("mp4") || mimeType.includes("m4a")) ext = "m4a";
      else if (mimeType.includes("ogg")) ext = "ogg";
      else if (mimeType.includes("wav")) ext = "wav";
      else if (mimeType.includes("mp3") || mimeType.includes("mpeg")) ext = "mp3";

      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, "");
      buffer = Buffer.from(cleanBase64, "base64");
    }

    const audioDir = getAudioDir();
    const filename = `${randomUUID()}.${ext}`;
    const filepath = path.join(audioDir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ filename, url: `/api/audio/${filename}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Failed to upload audio:", { message, stack });
    return NextResponse.json({ error: "Failed to upload audio", details: message }, { status: 500 });
  }
}
