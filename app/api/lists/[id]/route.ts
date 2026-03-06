import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET single list item
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const listItem = await prisma.listItem.findUnique({
      where: { id },
    });
    if (!listItem) {
      return NextResponse.json({ error: "List item not found" }, { status: 404 });
    }
    return NextResponse.json(listItem);
  } catch (error) {
    console.error("Failed to fetch list item:", error);
    return NextResponse.json({ error: "Failed to fetch list item" }, { status: 500 });
  }
}

// PATCH update list item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const listItem = await prisma.listItem.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(listItem);
  } catch (error) {
    console.error("Failed to update list item:", error);
    return NextResponse.json({ error: "Failed to update list item" }, { status: 500 });
  }
}

// DELETE list item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.listItem.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete list item:", error);
    return NextResponse.json({ error: "Failed to delete list item" }, { status: 500 });
  }
}
