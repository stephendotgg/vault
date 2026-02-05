import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all notes (returns flat list, client builds tree)
export async function GET() {
  try {
    const notes = await prisma.note.findMany({
      where: { archived: false },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST create new note
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parentId = body.parentId || null;
    
    // Get the highest order among siblings
    const maxOrderNote = await prisma.note.findFirst({
      where: { parentId },
      orderBy: { order: "desc" },
    });
    const newOrder = (maxOrderNote?.order ?? -1) + 1;
    
    const note = await prisma.note.create({
      data: {
        title: "Untitled",
        content: "",
        icon: "📄",
        parentId,
        order: newOrder,
      },
    });
    return NextResponse.json(note);
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
