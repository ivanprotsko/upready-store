import { Module } from "@medusajs/framework/utils";
import MarketplaceWriteModuleService from "./service";

/**
 * The marketplace WRITE core: gates, consent ledger and audit journal
 * (w20-wb-write-core).
 *
 * It owns no transport. An adapter brings its registry, its credential slot
 * and its `send`; this module decides whether `send` is called at all:
 *
 *   types.ts      the vocabulary, including the adapter contract
 *   registry.ts   the allow-list check, run at each adapter's load
 *   execute.ts    the five gates and the only path to an adapter's `send`
 *   medusa-store.ts  the gates' view of Postgres for one tenant
 *
 * Adapters: `src/modules/wb-write` (Wildberries). `ozon-write` is meant to be
 * a second registry plus a second `send`, and nothing else — Ivan's order of
 * 2026-09-16 04:44 WITA.
 *
 * Nothing in this repository calls `marketplaceWrite` outside tests today.
 * That is checked by `__tests__/no-live-write-call-site.unit.spec.ts`.
 */
export const MARKETPLACE_WRITE_MODULE = "marketplace_write";

export default Module(MARKETPLACE_WRITE_MODULE, {
  service: MarketplaceWriteModuleService,
});
