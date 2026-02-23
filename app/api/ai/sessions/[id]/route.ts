import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteImageFileIfUnused, extractImageFilenames } from "@/lib/imageReferences";

// GET /api/ai/sessions/[id] - Get a specific session with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Failed to fetch chat session:", error);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}

// PATCH /api/ai/sessions/[id] - Update session title
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title } = body;

    const session = await prisma.chatSession.update({
      where: { id },
      data: { title },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Failed to update chat session:", error);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

// DELETE /api/ai/sessions/[id] - Delete a session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: {
          select: { content: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ success: true });
    }

    const imagesToCheck = new Set<string>();
    for (const message of session.messages) {
      for (const filename of extractImageFilenames(message.content)) {
        imagesToCheck.add(filename);
      }
    }

    await prisma.chatSession.delete({
      where: { id },
    });

    await Promise.all([...imagesToCheck].map((filename) => deleteImageFileIfUnused(filename)));

    return NextResponse.json({ success: true });
  } catch (error) {
    // Handle case where session was already deleted or doesn't exist
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ success: true }); // Already deleted, treat as success
    }
    console.error("Failed to delete chat session:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
