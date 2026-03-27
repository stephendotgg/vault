import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  type: "note" | "list";
  noteKind?: "note" | "sheet";
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
}

interface ScoredSearchResult extends SearchResult {
  score: number;
}

const SPREADSHEET_CONTENT_PREFIX = "vault:sheet:v1:";

// Strip HTML tags for text matching
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Create a snippet around the match
function createSnippet(text: string, query: string, maxLength: number = 150): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  
  if (index === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
  }
  
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + query.length + 100);
  
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  
  return snippet;
}

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normaliseText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function scoreMatch(text: string, query: string, queryTokens: string[]): number {
  const haystack = normaliseText(text);
  if (!haystack) return 0;

  let score = 0;
  if (haystack === query) score += 260;
  if (haystack.startsWith(query)) score += 180;
  if (haystack.includes(query)) score += 130;

  const words = haystack.split(" ").filter(Boolean);

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 32;
      continue;
    }

    if (words.some((word) => word.startsWith(token))) {
      score += 18;
      continue;
    }

    if (token.length >= 4) {
      const nearWord = words.some((word) => {
        if (Math.abs(word.length - token.length) > 1) return false;
        return levenshteinDistance(word, token) <= 1;
      });

      if (nearWord) {
        score += 10;
      }
    }
  }

  return score;
}

function scoreResult(title: string, body: string, query: string, queryTokens: string[]): number {
  const titleScore = scoreMatch(title, query, queryTokens);
  const bodyScore = scoreMatch(body, query, queryTokens);
  return titleScore * 2 + bodyScore;
}

function isSheetNote(note: { icon: string; content: string }): boolean {
  return note.icon === "sheet" || note.icon === "📊" || note.content.startsWith(SPREADSHEET_CONTENT_PREFIX);
}

function sheetContentToText(content: string): string {
  if (!content.startsWith(SPREADSHEET_CONTENT_PREFIX)) {
    return "";
  }

  try {
    const payload = content.slice(SPREADSHEET_CONTENT_PREFIX.length);
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return "";
    }

    return parsed
      .flatMap((row) => (Array.isArray(row) ? row : []))
      .map((cell) => (typeof cell === "string" ? cell.trim() : ""))
      .filter((cell) => cell.length > 0)
      .join(" ");
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const types = searchParams.get("types")?.split(",") || ["note", "list"];
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [], query: "" });
  }

  const results: ScoredSearchResult[] = [];
  const normalisedQuery = normaliseText(query);
  const queryTokens = tokenize(query);
  const queryCandidates = Array.from(new Set([query, ...queryTokens])).filter((token) => token.length >= 2);
  const candidateLimit = Math.min(limit * 8, 200);

  try {
    // Search notes
    if (types.includes("note")) {
      const notes = await prisma.note.findMany({
        where: {
          archived: false,
          OR: [
            ...queryCandidates.map((token) => ({ title: { contains: token } })),
            ...queryCandidates.map((token) => ({ content: { contains: token } })),
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: candidateLimit,
      });

      for (const note of notes) {
        const sheet = isSheetNote(note);
        const plainContent = sheet ? sheetContentToText(note.content) : stripHtml(note.content);
        const matchInTitle = note.title.toLowerCase().includes(query.toLowerCase());
        const fallbackSnippet = sheet ? "Sheet content" : "";
        const snippetSource = plainContent || fallbackSnippet;
        
        const score = scoreResult(note.title || "", plainContent, normalisedQuery, queryTokens);
        if (score <= 0) continue;

        results.push({
          type: "note",
          noteKind: sheet ? "sheet" : "note",
          id: note.id,
          title: note.title || (sheet ? "New sheet" : "New page"),
          snippet: matchInTitle 
            ? snippetSource.slice(0, 150) + (snippetSource.length > 150 ? "..." : "")
            : createSnippet(snippetSource, query),
          createdAt: note.createdAt.toISOString(),
          score,
        });
      }
    }

    // Search list items
    if (types.includes("list")) {
      const listItems = await prisma.listItem.findMany({
        where: {
          OR: [
            ...queryCandidates.map((token) => ({ key: { contains: token } })),
            ...queryCandidates.map((token) => ({ value: { contains: token } })),
            ...queryCandidates.map((token) => ({ tags: { contains: token } })),
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: candidateLimit,
      });

      for (const item of listItems) {
        const matchInKey = item.key.toLowerCase().includes(query.toLowerCase());
        
        const score = scoreResult(item.key, `${item.value} ${item.tags}`, normalisedQuery, queryTokens);
        if (score <= 0) continue;

        results.push({
          type: "list",
          id: item.id,
          title: item.key,
          snippet: matchInKey 
            ? item.value.slice(0, 150) + (item.value.length > 150 ? "..." : "")
            : createSnippet(item.value, query),
          createdAt: item.createdAt.toISOString(),
          score,
        });
      }
    }

    // Sort all results by relevance score, then by date recency
    results.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      results: results.slice(0, limit).map(({ score, ...result }) => result),
      query,
      total: results.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
