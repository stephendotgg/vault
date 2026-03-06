import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import { getDatabasePath } from "./paths";

const dbPath = getDatabasePath();

// Initialize the database and create tables if they don't exist
function initializeDatabase() {
  const db = new Database(dbPath);

  console.info("[db-migrations] startup check", { dbPath });

  const hasLegacyVaultItemTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='VaultItem'")
    .get() as { name: string } | undefined;
  const hasListItemTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ListItem'")
    .get() as { name: string } | undefined;

  if (hasLegacyVaultItemTable && !hasListItemTable) {
    console.info("[db-migrations] renaming table VaultItem -> ListItem");
    db.exec('ALTER TABLE "VaultItem" RENAME TO "ListItem";');
    console.info("[db-migrations] table rename complete");
  } else if (hasLegacyVaultItemTable && hasListItemTable) {
    console.warn("[db-migrations] both VaultItem and ListItem tables found; skipping auto-rename");
  } else {
    console.info("[db-migrations] no table rename needed");
  }

  const noteColumns = db
    .prepare("PRAGMA table_info('Note')")
    .all() as Array<{ name: string }>;
  const hasNoteLockColumn = noteColumns.some((column) => column.name === "isLocked");
  if (noteColumns.length > 0 && !hasNoteLockColumn) {
    console.info("[db-migrations] adding Note.isLocked column");
    db.exec('ALTER TABLE "Note" ADD COLUMN "isLocked" INTEGER NOT NULL DEFAULT 0;');
    console.info("[db-migrations] Note.isLocked column added");
  }
  
  // Create tables if they don't exist (for production where prisma db push hasn't run)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Note (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT 'Untitled',
      content TEXT DEFAULT '',
      icon TEXT DEFAULT '📄',
      "order" INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      isLocked INTEGER DEFAULT 0,
      parentId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parentId) REFERENCES Note(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ListItem (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Occasion (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT 'Untitled',
      icon TEXT DEFAULT '📸',
      "order" INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS Memory (
      id TEXT PRIMARY KEY,
      content TEXT DEFAULT '',
      "order" INTEGER DEFAULT 0,
      occasionId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occasionId) REFERENCES Occasion(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS OccasionImage (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      "order" INTEGER DEFAULT 0,
      occasionId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occasionId) REFERENCES Occasion(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ChatSession (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT 'New Chat',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ChatMessage (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sessionId) REFERENCES ChatSession(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS AISettings (
      id TEXT PRIMARY KEY DEFAULT 'singleton',
      instructions TEXT DEFAULT '[]',
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  db.close();
}

// Ensure tables exist before Prisma connects
initializeDatabase();

const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
