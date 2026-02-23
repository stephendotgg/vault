import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

type UploadLike = Blob & { name?: string };

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}

function getImageExtension(file: UploadLike): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/svg+xml") return "svg";

  const fromName = file.name?.split(".").pop()?.toLowerCase();
  return fromName && /^[a-z0-9]+$/.test(fromName) ? fromName : "png";
}

// POST /api/ai/sessions/[id]/images - upload one image for a chat session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = randomUUID();
  const { id } = await params;

  try {
    console.log("[ai:image-upload] request:start", {
      requestId,
      sessionId: id,
      method: request.method,
      contentType: request.headers.get("content-type"),
    });

    const session = await prisma.chatSession.findUnique({ where: { id } });
    if (!session) {
      console.error("[ai:image-upload] session:not-found", { requestId, sessionId: id });
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const keys = Array.from(formData.keys());
    console.log("[ai:image-upload] formdata:keys", { requestId, keys });

    const image = formData.get("image") as UploadLike | null;

    if (!image) {
      console.error("[ai:image-upload] image:missing", { requestId, keys });
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    console.log("[ai:image-upload] image:metadata", {
      requestId,
      type: image.type,
      size: image.size,
      hasName: typeof image.name === "string",
      name: image.name ?? null,
      constructor: (image as { constructor?: { name?: string } }).constructor?.name,
    });

    if (typeof image.type !== "string" || !image.type.startsWith("image/")) {
      console.error("[ai:image-upload] image:invalid-type", {
        requestId,
        type: image.type,
      });
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const imagesDir = getImagesDir();
    const ext = getImageExtension(image);
    const filename = `${randomUUID()}.${ext}`;
    const filepath = path.join(imagesDir, filename);

    console.log("[ai:image-upload] file:target", {
      requestId,
      imagesDir,
      ext,
      filename,
      filepath,
    });

    const bytes = await image.arrayBuffer();
    console.log("[ai:image-upload] file:array-buffer", {
      requestId,
      byteLength: bytes.byteLength,
    });

    await writeFile(filepath, Buffer.from(bytes));

    console.log("[ai:image-upload] request:success", {
      requestId,
      sessionId: id,
      filename,
    });

    return NextResponse.json(
      {
        requestId,
        filename,
        url: `/api/images/${filename}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const details = serialiseError(error);
    console.error("[ai:image-upload] request:error", {
      requestId,
      sessionId: id,
      ...details,
    });

    return NextResponse.json(
      {
        error: "Failed to upload image",
        requestId,
        details,
      },
      { status: 500 }
    );
  }
}