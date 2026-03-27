import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all list items
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const listItems = await prisma.listItem.findMany({
      where: search
        ? {
            OR: [
              { key: { contains: search } },
              { value: { contains: search } },
              { tags: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(listItems);
  } catch (error) {
    console.error("Failed to fetch list items:", error);
    return NextResponse.json({ error: "Failed to fetch list items" }, { status: 500 });
  }
}

// POST create new list item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value, tags } = body;

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const listItem = await prisma.listItem.create({
      data: {
        key,
        value: value || "",
        tags: tags || "",
      },
    });
    return NextResponse.json(listItem);
  } catch (error) {
    console.error("Failed to create list item:", error);
    return NextResponse.json({ error: "Failed to create list item" }, { status: 500 });
  }
}
