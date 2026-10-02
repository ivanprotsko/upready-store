import { readdirSync, statSync } from "fs";
import path from "path";

/**
 * Every module's migrations share ONE table, `mikro_orm_migrations`, keyed by
 * NAME alone (not by module). Two modules with a migration file of the same
 * name are two different migrations that look identical to Medusa: whichever
 * applied first marks the name as done, and the second's SQL is silently
 * skipped forever on any database where that happened.
 *
 * This is not hypothetical: `apps/backend/src/modules/tenant/migrations/Migration20261002120000.ts`
 * collided with `apps/backend/src/modules/wishlist/migrations/Migration20261002120000.ts`
 * (both minted the same minute, by different work), the wishlist one was
 * already applied on the stand and on live, so the tenant one never ran — its
 * CHECK constraint update was skipped and `PUT /tenants/telegram-bot` answered
 * 500 CheckConstraintViolation (found on the stand 2026-10-03, t-cherk-telegram-login).
 *
 * This test fails loudly, at test time, on a second occurrence instead.
 */

const MODULES_ROOT = path.resolve(__dirname, "..");
const MIGRATION_FILE = /^Migration.*\.ts$/;

const allMigrationBasenames = (): Map<string, string[]> => {
  const byName = new Map<string, string[]>();

  for (const moduleName of readdirSync(MODULES_ROOT)) {
    const migrationsDir = path.join(MODULES_ROOT, moduleName, "migrations");
    if (!statSync(path.join(MODULES_ROOT, moduleName)).isDirectory()) {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(migrationsDir);
    } catch {
      continue; // no migrations directory in this module
    }

    for (const file of entries) {
      if (!MIGRATION_FILE.test(file)) {
        continue;
      }
      const relative = path.join(moduleName, "migrations", file);
      const existing = byName.get(file) ?? [];
      existing.push(relative);
      byName.set(file, existing);
    }
  }

  return byName;
};

describe("migration file names are unique across every module", () => {
  it("has no two migration files with the same basename", () => {
    const byName = allMigrationBasenames();
    const duplicates = [...byName.entries()].filter(([, files]) => files.length > 1);

    if (duplicates.length) {
      const report = duplicates
        .map(([name, files]) => `${name}:\n  ${files.join("\n  ")}`)
        .join("\n");
      throw new Error(
        `Duplicate migration file name(s) across modules — they share one ` +
          `mikro_orm_migrations table keyed by name, so one of these silently ` +
          `never runs:\n${report}`,
      );
    }

    // Sanity: the walk itself found a non-trivial number of files, so a
    // refactor that breaks the glob fails this test instead of passing empty.
    const total = [...byName.values()].reduce((sum, files) => sum + files.length, 0);
    expect(total).toBeGreaterThan(20);
  });
});
