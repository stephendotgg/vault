import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_INSTRUCTIONS = [
  "Be concise and direct. No filler words or unnecessary preamble.",
  "Use British English spelling.",
];

// GET - fetch AI settings
export async function GET() {
  try {
    let settings = await prisma.aISettings.findUnique({
      where: { id: "singleton" },
    });

    if (!settings) {
      // Create default settings
      settings = await prisma.aISettings.create({
        data: {
          id: "singleton",
          instructions: JSON.stringify(DEFAULT_INSTRUCTIONS),
        },
      });
    }

    return NextResponse.json({
      instructions: JSON.parse(settings.instructions),
    });
  } catch (error) {
    console.error("Failed to fetch AI settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PUT - update AI settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { instructions } = body;

    if (!Array.isArray(instructions)) {
      return NextResponse.json({ error: "Instructions must be an array" }, { status: 400 });
    }

    const settings = await prisma.aISettings.upsert({
      where: { id: "singleton" },
      update: {
        instructions: JSON.stringify(instructions),
      },
      create: {
        id: "singleton",
        instructions: JSON.stringify(instructions),
      },
    });

    return NextResponse.json({
      instructions: JSON.parse(settings.instructions),
    });
  } catch (error) {
    console.error("Failed to update AI settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
