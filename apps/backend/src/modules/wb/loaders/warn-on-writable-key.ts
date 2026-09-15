import type { LoaderOptions } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv } from "../../../tenant-secrets/crypto";
import type { WildberriesCredentials } from "../../../tenant-secrets/wildberries";
import { inspectToken, readOnlyWarning } from "../token";

/**
 * One WARNING line per shop whose Wildberries key is not marked read-only
 * (w01-wb-readonly-client).
 *
 * It is a warning and not a refusal. Ivan's order was that a key which
 * wrongly carries write rights must never result in a write, and that is
 * already true by construction: `transport.ts` can only send the reads listed
 * in `endpoints.ts`. What the owner still needs to know is that the key they
 * were issued is broader than it should be, so they can reissue it.
 *
 * Everything here is defensive on purpose. A loader runs on every boot,
 * including on a database whose migrations have not run yet and during
 * `medusa db:generate`, so a missing table, a missing encryption key or a
 * malformed row must produce a log line and never a failed boot.
 */
export default async function warnOnWritableWbKey({ container, logger }: LoaderOptions): Promise<void> {
  const log = logger ?? console;

  let pg: Knex;
  try {
    pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  } catch {
    return;
  }

  let rows: Array<{ tenant_id: string; payload: string }>;
  try {
    rows = (await pg("tenant_integration_secret")
      .select("tenant_id", "payload")
      .where({ provider: "wildberries", is_enabled: true })
      .whereNull("deleted_at")) as Array<{ tenant_id: string; payload: string }>;
  } catch (error) {
    // No table yet (a fresh database), or no database at all. Nothing to check.
    log.debug?.(
      `[wb] could not read the Wildberries keys at boot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (!rows.length) {
    return;
  }

  let key: Buffer;
  try {
    key = keyFromEnv();
  } catch {
    log.warn(
      "[wb] INTEGRATION_ENCRYPTION_KEY is not set, so the stored Wildberries keys cannot be " +
        "inspected at boot. The transport still cannot write to WB.",
    );
    return;
  }

  for (const row of rows) {
    let credentials: WildberriesCredentials | null = null;
    try {
      credentials = decryptJson<WildberriesCredentials>(row.payload, key);
    } catch (error) {
      log.warn(
        `[wb] the Wildberries key of tenant ${row.tenant_id} could not be decrypted: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    const warning = readOnlyWarning(inspectToken(credentials?.api_key));
    if (warning) {
      log.warn(`${warning} (tenant ${row.tenant_id})`);
    }
  }
}
