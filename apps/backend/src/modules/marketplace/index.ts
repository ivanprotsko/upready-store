import { Module } from "@medusajs/framework/utils";
import MarketplaceModuleService from "./service";

/**
 * The marketplace CORE (w12-marketplace-core).
 *
 * It owns the normalized layer (`mp_product`, `mp_offer`, `mp_order`,
 * `mp_order_line`, `mp_review`, `mp_question`, `mp_link`), the shared run log
 * (`mp_sync_run`) and the shared transport journal (`mp_api_call`). Next to
 * the models sit the pieces every adapter is held to:
 *
 *   contract.ts   the type an adapter implements. No I/O in it, ever.
 *   registry.ts   MARKETPLACES — the ONE place adapters are enumerated.
 *   guards.ts     the shared validator, run at load by every adapter.
 *   link.ts       marketplace card -> product of the shop, by article.
 *   project.ts    raw mirrors -> mp_*; idempotent, re-runnable.
 *
 * This module talks to no marketplace. The adapters do, each through its own
 * single I/O point (`modules/wb/transport.ts`, `modules/ozon/transport.ts`),
 * and neither of them can send anything but a registered read. Ivan's order of
 * 2026-09-16 02:46 WITA stands: marketplaces are read-only for us, and this
 * core makes that guarantee stronger by applying it to every adapter
 * automatically rather than by copying it into each one.
 */
export const MARKETPLACE_MODULE = "marketplace";

export default Module(MARKETPLACE_MODULE, {
  service: MarketplaceModuleService,
});
