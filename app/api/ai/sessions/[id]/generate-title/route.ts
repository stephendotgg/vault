import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/ai/sessions/[id]/generate-title - Generate title using AI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { apiKey, provider = "openrouter", endpoint } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "API key required" }, { status: 400 });
    }

    if (provider === "azure-foundry" && !endpoint) {
      return NextResponse.json({ error: "Azure Foundry endpoint required" }, { status: 400 });
    }

    // Get session with messages
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 4 } },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.messages.length < 2) {
      return NextResponse.json({ error: "Need at least 2 messages" }, { status: 400 });
    }

    // Build conversation summary for title
    const conversationSnippet = session.messages
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const titlePrompt = `Generate a very short title (3-5 words max) for this conversation. Just the title, no quotes or punctuation.

${conversationSnippet}`;

    const isAzureFoundry = provider === "azure-foundry";
    const targetUrl = isAzureFoundry
      ? `${String(endpoint).trim().replace(/\/+$/, "")}/chat/completions?api-version=2024-05-01-preview`
      : "https://openrouter.ai/api/v1/chat/completions";

    const targetHeaders: Record<string, string> = isAzureFoundry
      ? {
          "Content-Type": "application/json",
          "api-key": apiKey,
        }
      : {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://vault.app",
          "X-Title": "Vault",
        };

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: targetHeaders,
      body: JSON.stringify({
        model: isAzureFoundry ? "gpt-4o-mini" : "openai/gpt-4o-mini",
        messages: [{ role: "user", content: titlePrompt }],
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      throw new Error(`${provider} API error`);
    }

    const data = await response.json();
    let title = data.choices?.[0]?.message?.content?.trim() || "New Chat";

    // Clean up title
    title = title.replace(/^["']|["']$/g, "").slice(0, 50);

    // Update session title
    const updatedSession = await prisma.chatSession.update({
      where: { id },
      data: { title },
    });

    return NextResponse.json({ title: updatedSession.title });
  } catch (error) {
    console.error("Failed to generate title:", error);
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
