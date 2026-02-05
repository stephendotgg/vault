import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all notes
export async function GET() {
  try {
    const notes = await prisma.note.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// POST create new note
export async function POST() {
  try {
    const note = await prisma.note.create({
      data: {
        title: "Untitled",
        content: "",
        icon: "📄",
      },
    });
    return NextResponse.json(note);
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
