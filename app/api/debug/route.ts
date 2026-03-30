import { NextResponse } from "next/server";
import path from "path";
import { existsSync } from "fs";

export async function GET() {
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PRIVATE_STANDALONE: process.env.NEXT_PRIVATE_STANDALONE,
      MOTHERSHIP_DATA_DIR: process.env.MOTHERSHIP_DATA_DIR,
      APPDATA: process.env.APPDATA,
    },
  };

  // Check data dir
  try {
    const { getDatabasePath, getDataDir } = await import("@/lib/paths");
    const dataDir = getDataDir();
    const dbPath = getDatabasePath();
    diag.dataDir = dataDir;
    diag.dbPath = dbPath;
    diag.dbExists = existsSync(dbPath);
    
    // Check vault.log
    const logPath = path.join(dataDir, "data", "vault.log");
    diag.logPath = logPath;
    diag.logExists = existsSync(logPath);
    if (existsSync(logPath)) {
      const { readFileSync } = await import("fs");
      const content = readFileSync(logPath, "utf8");
      diag.logTail = content.slice(-2000);
    }
  } catch (err) {
    diag.pathsError = err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  }

  // Check prisma
  try {
    const { prisma } = await import("@/lib/prisma");
    const count = await prisma.note.count();
    diag.prisma = { status: "connected", noteCount: count };
  } catch (err) {
    diag.prismaError = err instanceof Error ? { message: err.message, stack: err.stack } : String(err);
  }

  return NextResponse.json(diag, { status: 200 });
}
