import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/ai/sessions/[id]/messages - Add a message to a session
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json({ error: "Role and content are required" }, { status: 400 });
    }

    // Check session exists
    const session = await prisma.chatSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        role,
        content,
        sessionId: id,
      },
    });

    // Touch the session to update updatedAt
    await prisma.chatSession.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("Failed to add message:", error);
    return NextResponse.json({ error: "Failed to add message", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
