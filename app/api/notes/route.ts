import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SPREADSHEET_CONTENT_PREFIX = "vault:sheet:v1:";

function createDefaultSpreadsheetContent(rows = 30, cols = 12): string {
  const data = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "")
  );

  return `${SPREADSHEET_CONTENT_PREFIX}${JSON.stringify(data)}`;
}

// GET all notes (returns flat list, client builds tree)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    
    const notes = await prisma.note.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("Failed to fetch notes:", error);
    return NextResponse.json({ error: "Failed to fetch notes", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// POST create new note
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parentId = body.parentId || null;
    const kind = body.kind === "spreadsheet" ? "spreadsheet" : "note";
    
    // Get the highest order among siblings
    const maxOrderNote = await prisma.note.findFirst({
      where: { parentId },
      orderBy: { order: "desc" },
    });
    const newOrder = (maxOrderNote?.order ?? -1) + 1;
    
    const note = await prisma.note.create({
      data: {
        title: "",
        content: kind === "spreadsheet" ? createDefaultSpreadsheetContent() : "",
        icon: kind === "spreadsheet" ? "sheet" : "📄",
        parentId,
        order: newOrder,
      },
    });
    return NextResponse.json(note);
  } catch (error) {
    console.error("Failed to create note:", error);
    return NextResponse.json({ error: "Failed to create note", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
