import { NextRequest, NextResponse } from "next/server";
import { getAudioDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

function parseMultipartAudio(body: Buffer, boundary: string): { buffer: Buffer; type: string } | null {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const crlfcrlf = Buffer.from("\r\n\r\n");

  const start = body.indexOf(boundaryBuffer);
  if (start === -1) return null;

  const headerEnd = body.indexOf(crlfcrlf, start);
  if (headerEnd === -1) return null;

  const headers = body.subarray(start, headerEnd).toString("utf8");
  const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
  const type = contentTypeMatch ? contentTypeMatch[1].trim() : "audio/webm";

  const dataStart = headerEnd + crlfcrlf.length;
  const endBoundary = Buffer.from(`\r\n--${boundary}`);
  let dataEnd = body.indexOf(endBoundary, dataStart);
  if (dataEnd === -1) dataEnd = body.length;

  return { buffer: body.subarray(dataStart, dataEnd), type };
}

export async function POST(request: NextRequest) {
  try {
    let buffer: Buffer;
    let ext = "webm";

    const contentType = (request.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
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
    } else {
      // Read raw body bytes — works in both dev and standalone production
      const arrayBuffer = await request.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      // Try to detect format from content-type boundary or default to webm
      if (contentType.includes("multipart/form-data")) {
        // Parse the multipart body manually to extract the file
        const boundary = contentType.split("boundary=")[1]?.split(";")[0]?.trim();
        if (boundary) {
          const parsed = parseMultipartAudio(buffer, boundary);
          if (parsed) {
            buffer = parsed.buffer;
            const type = parsed.type.toLowerCase();
            if (type.includes("mp4") || type.includes("m4a")) ext = "m4a";
            else if (type.includes("ogg")) ext = "ogg";
            else if (type.includes("wav")) ext = "wav";
            else if (type.includes("mp3") || type.includes("mpeg")) ext = "mp3";
          }
        }
      }
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
