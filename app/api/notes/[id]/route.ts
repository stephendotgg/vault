import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteImageFileIfUnused, extractImageFilenames } from "@/lib/imageReferences";

// GET single note
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const note = await prisma.note.findUnique({
      where: { id },
    });
    
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    
    return NextResponse.json(note);
  } catch (error) {
    console.error("Failed to fetch note:", error);
    return NextResponse.json({ error: "Failed to fetch note" }, { status: 500 });
  }
}

// PATCH update note
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existingNote = await prisma.note.findUnique({
      where: { id },
      select: { content: true, title: true, parentId: true },
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const isProtectedCategory =
      existingNote.parentId === null &&
      (existingNote.title === "Quick Notes" || existingNote.title === "Calls");

    if (body.archived === true && isProtectedCategory) {
      return NextResponse.json(
        { error: "This category cannot be archived" },
        { status: 400 }
      );
    }
    
    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.archived !== undefined && { archived: body.archived }),
        ...(body.isLocked !== undefined && { isLocked: body.isLocked }),
      },
    });

    if (body.content !== undefined) {
      const before = extractImageFilenames(existingNote.content);
      const after = extractImageFilenames(note.content);
      const removed = [...before].filter((filename) => !after.has(filename));

      await Promise.all(removed.map((filename) => deleteImageFileIfUnused(filename)));
    }
    
    return NextResponse.json(note);
  } catch (error) {
    console.error("Failed to update note:", error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

// DELETE note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const allNotes = await prisma.note.findMany({
      select: {
        id: true,
        parentId: true,
        content: true,
      },
    });

    const childrenByParent = new Map<string, string[]>();
    for (const note of allNotes) {
      if (!note.parentId) continue;
      const children = childrenByParent.get(note.parentId) || [];
      children.push(note.id);
      childrenByParent.set(note.parentId, children);
    }

    const idsToDelete = new Set<string>();
    const queue: string[] = [id];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || idsToDelete.has(currentId)) continue;
      idsToDelete.add(currentId);

      const children = childrenByParent.get(currentId) || [];
      queue.push(...children);
    }

    if (!idsToDelete.has(id)) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const imagesToCheck = new Set<string>();
    for (const note of allNotes) {
      if (!idsToDelete.has(note.id)) continue;
      for (const filename of extractImageFilenames(note.content)) {
        imagesToCheck.add(filename);
      }
    }

    await prisma.note.delete({
      where: { id },
    });

    await Promise.all([...imagesToCheck].map((filename) => deleteImageFileIfUnused(filename)));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
