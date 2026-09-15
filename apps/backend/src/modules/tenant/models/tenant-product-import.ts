import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * One catalogue file a shop owner uploaded (t14-product-import): the dry run
 * they are looking at, and the file it was made from.
 *
 * It is a row rather than request state for one reason: the report has to
 * survive a page reload. The owner uploads a price list, reads a hundred-line
 * report, goes to check something, comes back — and a report held in the
 * browser or in a server-side cache would be gone, leaving them to upload
 * again and re-read it. `GET /tenants/products/import/:id` answers from here.
 *
 * `source` is the uploaded file itself, normalised (BOM stripped, line endings
 * LF). Keeping it is what lets `confirm` RE-PLAN against the catalogue as it
 * stands at that moment instead of replaying a plan made minutes earlier: a
 * product someone edited in the panel in between must not be written over by a
 * stale diff. The size cap on an upload (`MAX_FILE_BYTES` in
 * `src/product-csv/plan.ts`) is therefore also the cap on this column.
 */
const TenantProductImport = model
  .define("tenant_product_import", {
    id: model.id({ prefix: "tpimp" }).primaryKey(),
    /** The name the owner's file had, shown in the panel. */
    filename: model.text(),
    /** Byte length of the upload, for the report and the limits line. */
    bytes: model.number().default(0),
    /**
     * `pending` — planned, nothing written, waiting for the owner.
     * `applied` — every actionable row written.
     * `partially_applied` — a write failed mid-file; `report.stopped_at_line`
     * names where, and the rows carry `applied`.
     * `rejected` — the file has a fatal error and can never be applied.
     * `cancelled` — the owner dropped it.
     */
    status: model.text().default("pending"),
    /** `;`, `,` or a tab, as detected from the header line. */
    delimiter: model.text().default(";"),
    /** The file as uploaded, normalised. Re-parsed on confirm. */
    source: model.text().default(""),
    /** The whole report: summary, fatal errors, one entry per row. */
    report: model.json(),
    confirmed_at: model.dateTime().nullable(),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "product_imports",
    }),
  })
  .indexes([
    {
      // The panel's own read: this shop's uploads, newest first.
      on: ["tenant_id", "created_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantProductImport;
