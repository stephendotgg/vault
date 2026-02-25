import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImagesDir } from "@/lib/paths";
import { readFile } from "fs/promises";
import path from "path";

// Strip HTML tags from notes
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Get context from database based on keywords
async function getRelevantContext(query: string, limit: number = 5): Promise<string[]> {
  const context: string[] = [];
  
  // Extract keywords (simple approach - can be improved)
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "have", "been", "were", "they", "this", "that", "with", "what", "when", "where", "which", "their", "about"].includes(w));
  
  if (keywords.length === 0) {
    // No specific keywords, get recent notes as context
    const recentNotes = await prisma.note.findMany({
      where: { archived: false },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    
    for (const note of recentNotes) {
      const content = stripHtml(note.content);
      if (content.length > 0) {
        context.push(`[Note: ${note.title}]\n${content.slice(0, 500)}`);
      }
    }
    return context;
  }

  // Search notes for keywords
  const notes = await prisma.note.findMany({
    where: {
      archived: false,
      OR: keywords.flatMap(kw => [
        { title: { contains: kw } },
        { content: { contains: kw } },
      ]),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  for (const note of notes) {
    const content = stripHtml(note.content);
    if (content.length > 0) {
      context.push(`[Note: ${note.title}]\n${content.slice(0, 500)}`);
    }
  }

  // Search vault items
  const vaultItems = await prisma.vaultItem.findMany({
    where: {
      OR: keywords.flatMap(kw => [
        { key: { contains: kw } },
        { value: { contains: kw } },
      ]),
    },
    take: limit,
  });

  for (const item of vaultItems) {
    context.push(`[Vault: ${item.key}]\n${item.value.slice(0, 200)}`);
  }

  // Search memories
  const memories = await prisma.memory.findMany({
    where: {
      OR: keywords.map(kw => ({ content: { contains: kw } })),
    },
    include: { occasion: true },
    take: limit,
  });

  for (const memory of memories) {
    context.push(`[Memory from ${memory.occasion.title}]\n${memory.content.slice(0, 300)}`);
  }

  return context;
}

function getImageMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

async function resolveImageUrlForProvider(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:") || /^https?:\/\//i.test(imageUrl)) {
    try {
      const parsed = new URL(imageUrl);
      const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
      if (!localHostnames.has(parsed.hostname) || !parsed.pathname.startsWith("/api/images/")) {
        return imageUrl;
      }
      imageUrl = parsed.pathname;
    } catch {
      return imageUrl;
    }
  }

  if (!imageUrl.startsWith("/api/images/")) {
    return imageUrl;
  }

  const filename = path.basename(imageUrl.replace("/api/images/", ""));
  const imagePath = path.join(getImagesDir(), filename);
  const buffer = await readFile(imagePath);
  const mimeType = getImageMimeType(filename);
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function normaliseMessagesForProvider(messages: Array<{ role: string; content: unknown }>) {
  const normalised = [];

  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      normalised.push(message);
      continue;
    }

    const parts = [];
    for (const part of message.content as Array<{ type?: string; image_url?: { url?: string } }>) {
      if (part?.type === "image_url" && part.image_url?.url) {
        const resolvedUrl = await resolveImageUrlForProvider(part.image_url.url);
        parts.push({
          ...part,
          image_url: {
            ...part.image_url,
            url: resolvedUrl,
          },
        });
      } else {
        parts.push(part);
      }
    }

    normalised.push({
      ...message,
      content: parts,
    });
  }

  return normalised;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, apiKey, model = "openai/gpt-4o-mini", instructions = [], noteContext } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages are required" }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ 
        error: "API key required",
        message: "Please set your OpenRouter API key in Settings." 
      }, { status: 400 });
    }

    // Get the last user message for context search
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    // Handle multimodal content (array) vs plain text (string)
    let contextQuery = "";
    if (lastUserMessage?.content) {
      if (typeof lastUserMessage.content === "string") {
        contextQuery = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        // Extract text from multimodal content array
        const textPart = lastUserMessage.content.find((p: { type: string; text?: string }) => p.type === "text");
        contextQuery = textPart?.text || "";
      }
    }

    // If noteContext is provided, use it directly; otherwise search for relevant context
    let contextSection = "";
    if (noteContext) {
      // Direct note context mode (from in-note AI chat)
      contextSection = `You are helping the user with their note titled "${noteContext.title}".

Here is the full content of the note:

${noteContext.content}

Answer questions about this note, help expand on ideas, suggest improvements, or assist with whatever the user needs regarding this content. Be concise and direct. Use British English spelling.`;
    } else {
      // Standard mode - search for relevant context
      const relevantContext = await getRelevantContext(contextQuery);
      contextSection = relevantContext.length > 0 
        ? `Here is relevant context from the user's data:\n\n${relevantContext.join("\n\n")}\n\nUse this context to provide helpful, accurate responses. If referencing their notes or memories, mention where the information comes from.`
        : "No specific relevant context found for this query. Answer based on the conversation.";
    }

    // Build user instructions string
    const userInstructions = Array.isArray(instructions) && instructions.length > 0 
      ? instructions.join(" ") 
      : "Be concise and direct. Use British English spelling.";

    const providerMessages = await normaliseMessagesForProvider(messages);

    // Build system prompt with context
    const systemPrompt = `You are a helpful AI assistant integrated into Vault, a personal notes and memories app. You have access to the user's notes, vault items, and memories to help answer their questions.

${contextSection}

${userInstructions}`;

    // Call OpenRouter API (OpenAI-compatible format) with streaming
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://vault.app",
        "X-Title": "Vault",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...providerMessages,
        ],
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter API error:", error);
      return NextResponse.json({ 
        error: "AI request failed",
        message: `API error: ${response.status}` 
      }, { status: response.status });
    }

    // Create a TransformStream to process SSE chunks
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json({ 
      error: "Failed to process chat",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
