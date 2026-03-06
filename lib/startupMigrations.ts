type StartupMigration = {
  version: number;
  name: string;
  run: () => void;
};

const STARTUP_MIGRATION_VERSION_KEY = "mothership-startup-migration-version";

function safeParseJson(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid JSON and leave data as-is
  }

  return null;
}

function migrateSidebarVisibilityVaultToLists(): void {
  const key = "sidebar-visible-sections";
  const parsed = safeParseJson(localStorage.getItem(key));
  if (!parsed) {
    return;
  }

  const hasLists = typeof parsed.lists === "boolean";
  const hasVault = typeof parsed.vault === "boolean";

  if (!hasLists && hasVault) {
    parsed.lists = parsed.vault;
  }

  delete parsed.vault;
  localStorage.setItem(key, JSON.stringify(parsed));
}

function migrateSidebarSectionsVaultToLists(): void {
  const key = "sidebar-sections";
  const parsed = safeParseJson(localStorage.getItem(key));
  if (!parsed) {
    return;
  }

  const hasLists = typeof parsed.lists === "boolean";
  const hasVault = typeof parsed.vault === "boolean";

  if (!hasLists && hasVault) {
    parsed.lists = parsed.vault;
  }

  delete parsed.vault;
  localStorage.setItem(key, JSON.stringify(parsed));
}

const STARTUP_MIGRATIONS: StartupMigration[] = [
  {
    version: 1,
    name: "rebrand-vault-to-lists-sidebar-keys",
    run: () => {
      migrateSidebarVisibilityVaultToLists();
      migrateSidebarSectionsVaultToLists();
    },
  },
];

function getCurrentMigrationVersion(): number {
  const raw = localStorage.getItem(STARTUP_MIGRATION_VERSION_KEY);
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setCurrentMigrationVersion(version: number): void {
  localStorage.setItem(STARTUP_MIGRATION_VERSION_KEY, String(version));
}

export function runStartupMigrations(): { appliedMigrations: string[] } {
  if (typeof window === "undefined") {
    return { appliedMigrations: [] };
  }

  let currentVersion = getCurrentMigrationVersion();
  const appliedMigrations: string[] = [];

  console.info("[startup-migrations] current version", currentVersion);

  const pendingMigrations = STARTUP_MIGRATIONS
    .filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length === 0) {
    console.info("[startup-migrations] no pending migrations");
    return { appliedMigrations };
  }

  console.info(
    "[startup-migrations] pending",
    pendingMigrations.map((migration) => ({ version: migration.version, name: migration.name }))
  );

  for (const migration of pendingMigrations) {
    try {
      console.info("[startup-migrations] applying", {
        version: migration.version,
        name: migration.name,
      });

      migration.run();
      currentVersion = migration.version;
      setCurrentMigrationVersion(currentVersion);
      appliedMigrations.push(migration.name);

      console.info("[startup-migrations] applied", {
        version: migration.version,
        name: migration.name,
      });
    } catch (error) {
      console.error("[startup-migrations] failed", {
        version: migration.version,
        name: migration.name,
        error,
      });
      throw error;
    }
  }

  console.info("[startup-migrations] complete", {
    finalVersion: currentVersion,
    appliedCount: appliedMigrations.length,
  });

  return { appliedMigrations };
}
