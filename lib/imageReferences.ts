import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { existsSync } from "fs";
import { unlink } from "fs/promises";
import path from "path";

const IMAGE_URL_REGEX = /\/api\/images\/([a-zA-Z0-9._-]+)/g;

export function extractImageFilenames(content: string): Set<string> {
  const filenames = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = IMAGE_URL_REGEX.exec(content)) !== null) {
    const filename = path.basename(match[1]);
    if (filename) {
      filenames.add(filename);
    }
  }

  return filenames;
}

export async function isImageReferencedAnywhere(filename: string): Promise<boolean> {
  const safeFilename = path.basename(filename);
  const imageUrl = `/api/images/${safeFilename}`;

  const [noteReference, chatReference] = await Promise.all([
    prisma.note.findFirst({
      where: {
        content: {
          contains: imageUrl,
        },
      },
      select: { id: true },
    }),
    prisma.chatMessage.findFirst({
      where: {
        content: {
          contains: imageUrl,
        },
      },
      select: { id: true },
    }),
  ]);

  return Boolean(noteReference || chatReference);
}

export async function deleteImageFileIfUnused(filename: string): Promise<void> {
  const safeFilename = path.basename(filename);
  const referenced = await isImageReferencedAnywhere(safeFilename);
  if (referenced) {
    return;
  }

  const imagePath = path.join(getImagesDir(), safeFilename);
  if (existsSync(imagePath)) {
    await unlink(imagePath);
  }
}