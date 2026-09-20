import { model } from "@medusajs/framework/utils";

/**
 * Every attempt to mutate a marketplace, whatever came of it
 * (w20-wb-write-core).
 *
 * This is the evidence half of the write gates. `execute.ts` makes a
 * mutation impossible to express without five open gates; this table lets
 * anyone CHECK afterwards what the process did, without trusting the code:
 *
 *     select marketplace, outcome, count(*) from marketplace_write_audit group by 1, 2;
 *
 * While the write phase is unbuilt the honest answer is that every row is
 * `outcome = 'refused'` or `'dry_run'`, and `dry_run = true` means nothing
 * left this process. A row with `outcome = 'sent'` is a request Wildberries
 * or Ozon actually received.
 *
 * `payload_sha256` fingerprints the body as it was validated, so an edit to
 * `payload` after the fact does not pass unnoticed.
 */
const MarketplaceWriteAudit = model
  .define("marketplace_write_audit", {
    id: model.id({ prefix: "mwaud" }).primaryKey(),
    tenant_id: model.text(),
    /** `wb`, later `ozon`. Copied from the adapter, never from a caller. */
    marketplace: model.text(),
    op_class: model.text(),
    endpoint_id: model.text(),
    method: model.text(),
    /** The path as it would be, or was, sent: placeholders already filled. */
    path: model.text(),
    payload: model.json().nullable(),
    payload_sha256: model.text(),
    /** `true` when nothing left the process. Refusals count as dry runs. */
    dry_run: model.boolean().default(true),
    /** `refused` | `dry_run` | `sent`. Text, so a new outcome needs no migration. */
    outcome: model.text().default("dry_run"),
    /** Which gate refused, for `outcome = 'refused'`. */
    gate: model.text().nullable(),
    /** The tenant admin or script that asked. */
    actor: model.text(),
    status: model.number().nullable(),
    response: model.text().nullable(),
    error: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "created_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MarketplaceWriteAudit;
