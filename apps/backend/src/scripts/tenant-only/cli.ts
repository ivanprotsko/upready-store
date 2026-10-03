import { readFileSync } from "fs";
import path from "path";
import { parseTenantOnlyArgs, TenantOnlyUsageError, USAGE } from "./options";
import { formatResult } from "./report";
import { runTenantOnly } from "./runner";

/**
 * Keeps one tenant in a scratch copy of the platform database, anonymizes it
 * for a stand, or checks either. README.md next to this file is the manual.
 *
 *   npx ts-node src/scripts/tenant-only/cli.ts --db <url> --keep olavka --dry-run
 *
 * Plain Node and `pg`, not `medusa exec`: the Medusa services soft-delete, so
 * personal data would stay in the rows, and the work has to be one transaction
 * across every module's tables. `pg` is a devDependency of this app, which is
 * enough because the tool runs from a checkout, never from the image.
 */

export const TENANT_ONLY_SQL = path.join(__dirname, "tenant-only.sql");

const main = async (): Promise<number> => {
  let options;
  try {
    const parsed = parseTenantOnlyArgs(process.argv.slice(2));
    if (parsed === "help") {
      console.log(USAGE);
      return 0;
    }
    options = parsed;
  } catch (error) {
    if (error instanceof TenantOnlyUsageError) {
      console.error(`tenant-only: ${error.message}\n\n${USAGE}`);
      return error.exitCode;
    }
    throw error;
  }

  const sql = readFileSync(TENANT_ONLY_SQL, "utf8");
  const { Client } = require("pg") as typeof import("pg");
  const client = new Client({ connectionString: options.db });
  client.on("notice", (notice) => console.error(`notice: ${notice.message}`));
  await client.connect();
  try {
    const started = Date.now();
    const result = await runTenantOnly(client, options, sql);
    console.log(formatResult(result, options));
    console.log(`\n${((Date.now() - started) / 1000).toFixed(1)} s, exit ${result.exitCode}`);
    return result.exitCode;
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`tenant-only: ${(error as Error).message}`);
      process.exit(4);
    },
  );
}
