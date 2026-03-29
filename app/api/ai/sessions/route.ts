import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/ai/sessions - List all chat sessions
export async function GET() {
  try {
    const sessions = await prisma.chatSession.findMany({
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Failed to fetch chat sessions:", error);
    return NextResponse.json({ error: "Failed to fetch sessions", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// POST /api/ai/sessions - Create a new chat session
export async function POST() {
  try {
    const session = await prisma.chatSession.create({
      data: {
        title: "New Chat",
      },
      include: {
        messages: true,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Failed to create chat session:", error);
    return NextResponse.json({ error: "Failed to create session", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
