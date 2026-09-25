import { model } from "@medusajs/framework/utils";

/**
 * The platform's pricing page, one row per page (t-2026-09-25-08).
 *
 * Platform-level on purpose: no `tenant_id`. The page is the platform's own
 * offer to people who do not have a shop yet, it is edited by platform staff in
 * the Medusa admin, and it is read by a host that resolves to no tenant.
 *
 * `handle` names the page (`default` today) so that a later stage can keep a
 * draft or a second page next to it without a migration. `document` is the whole
 * page, validated by `PricingDocumentSchema` (../schema.ts) on every write and
 * every public read. `revision` goes up by one on every save; the admin sends
 * the revision it loaded, so a second editor's save is refused rather than
 * silently overwriting the first one's.
 */
const PlatformPricing = model.define("platform_pricing", {
  id: model.id({ prefix: "ppr" }).primaryKey(),
  handle: model.text().unique(),
  document: model.json(),
  revision: model.number().default(1),
  /** The admin user whose save produced this revision; null for a seed. */
  updated_by: model.text().nullable(),
});

export default PlatformPricing;
