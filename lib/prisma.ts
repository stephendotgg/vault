import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { getDatabasePath, serverLog, serverError } from "./paths";

const dbPath = getDatabasePath();
serverLog("[db] Database path:", dbPath);

const adapter = new PrismaLibSql({ url: `file:${dbPath}` });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  __mothershipDbInitialized?: boolean;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Create tables if they don't exist (for fresh installs where migrations haven't run).
// Uses Prisma's $executeRawUnsafe so no native module dependencies.
async function initializeDatabase() {
  serverLog("[db-migrations] startup check", { dbPath });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Note" (
      "id" TEXT PRIMARY KEY,
      "title" TEXT DEFAULT 'Untitled',
      "content" TEXT DEFAULT '',
      "icon" TEXT DEFAULT '📄',
      "order" INTEGER DEFAULT 0,
      "archived" INTEGER NOT NULL DEFAULT 0,
      "isLocked" INTEGER NOT NULL DEFAULT 0,
      "parentId" TEXT,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("parentId") REFERENCES "Note"("id") ON DELETE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ListItem" (
      "id" TEXT PRIMARY KEY,
      "key" TEXT NOT NULL,
      "value" TEXT DEFAULT '',
      "tags" TEXT DEFAULT '',
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatSession" (
      "id" TEXT PRIMARY KEY,
      "title" TEXT DEFAULT 'New Chat',
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChatMessage" (
      "id" TEXT PRIMARY KEY,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AISettings" (
      "id" TEXT PRIMARY KEY DEFAULT 'singleton',
      "instructions" TEXT DEFAULT '[]',
      "updatedAt" DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add isLocked column if it doesn't exist on an older database
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Note" ADD COLUMN "isLocked" INTEGER NOT NULL DEFAULT 0;`);
    serverLog("[db-migrations] Note.isLocked column added");
  } catch {
    // Column already exists — expected
  }

  serverLog("[db-migrations] initialization complete");
}

// Run async init on module load — completes before first request in practice
if (!globalForPrisma.__mothershipDbInitialized) {
  globalForPrisma.__mothershipDbInitialized = true;
  initializeDatabase().catch((err) => {
    serverError("[CRITICAL] Database initialization failed:", err);
  });
}
