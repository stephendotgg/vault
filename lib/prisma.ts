import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { getDatabasePath, serverLog, serverError } from "./paths";

// Dynamic require so we can catch native module load failures
let Database: typeof import("better-sqlite3").default;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require("better-sqlite3");
  serverLog("[db] better-sqlite3 loaded from:", require.resolve("better-sqlite3"));
} catch (err) {
  serverError("[CRITICAL] Failed to load better-sqlite3 native module:", err);
  serverError("[CRITICAL] This usually means the native binary was built for a different Node/Electron ABI.");
  serverError("[CRITICAL] require.resolve paths:", (module as NodeModule & { paths?: string[] }).paths);
  // Create a stub so the module still exports something (routes will fail with a clear error)
  Database = (() => { throw new Error("better-sqlite3 failed to load: " + (err instanceof Error ? err.message : String(err))); }) as unknown as typeof import("better-sqlite3").default;
}

let dbPath: string;
try {
  dbPath = getDatabasePath();
  serverLog("[db] Database path:", dbPath);
} catch (err) {
  serverError("[CRITICAL] Failed to get database path:", err);
  dbPath = "";
}
const globalForDbInit = globalThis as unknown as {
  __mothershipDbInitialized?: boolean;
};
const shouldLogDbMigrations =
  process.env.VAULT_DEBUG_DB_MIGRATIONS === "true" || process.env.NODE_ENV === "production";

function logDbMigrationInfo(message: string, payload?: unknown) {
  if (!shouldLogDbMigrations) {
    return;
  }

  if (payload === undefined) {
    serverLog(message);
    return;
  }

  serverLog(message, payload);
}

function logDbMigrationWarn(message: string) {
  if (!shouldLogDbMigrations) {
    return;
  }

  serverLog("[warn]", message);
}

// Initialize the database and create tables if they don't exist
function initializeDatabase() {
  const db = new Database(dbPath);

  logDbMigrationInfo("[db-migrations] startup check", { dbPath });

  const noteColumns = db
    .prepare("PRAGMA table_info('Note')")
    .all() as Array<{ name: string }>;
  const hasNoteLockColumn = noteColumns.some((column) => column.name === "isLocked");
  if (noteColumns.length > 0 && !hasNoteLockColumn) {
    logDbMigrationInfo("[db-migrations] adding Note.isLocked column");
    db.exec('ALTER TABLE "Note" ADD COLUMN "isLocked" INTEGER NOT NULL DEFAULT 0;');
    logDbMigrationInfo("[db-migrations] Note.isLocked column added");
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

// Ensure tables exist before Prisma connects (once per process)
if (!globalForDbInit.__mothershipDbInitialized) {
  try {
    initializeDatabase();
    globalForDbInit.__mothershipDbInitialized = true;
  } catch (err) {
    serverError("[CRITICAL] Database initialization failed:", err);
    serverError("[CRITICAL] DB path:", dbPath);
    serverError("[CRITICAL] better-sqlite3 loaded from:", require.resolve("better-sqlite3"));
  }
}

let adapter: PrismaBetterSqlite3;
try {
  adapter = new PrismaBetterSqlite3({
    url: `file:${dbPath}`,
  });
} catch (err) {
  serverError("[CRITICAL] PrismaBetterSqlite3 adapter creation failed:", err);
  serverError("[CRITICAL] DB path:", dbPath);
  throw err;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
