import type { MarketplaceAdapter, MarketplaceId, MutationEntry } from "./contract";
import { ozonAdapter } from "../ozon/adapter";
import { wbAdapter } from "../wb/adapter";

/**
 * THE ONE PLACE ADAPTERS ARE ENUMERATED (w12-marketplace-core, spec 2.1).
 *
 * Everything that needs the list imports it from here: the conformance suite,
 * the repo lint, the panel route, the status routes, the projector and the
 * scheduler. A second hard-coded list anywhere is the defect this file exists
 * to remove — before it, `wb` and `ozon` were spelled out by hand in each of
 * those places, and the third marketplace would have been forgotten in at
 * least one of them (rule 20).
 *
 * The practical test of that claim is in `__tests__/single-call-site.unit.spec.ts`:
 * the repo lint takes its host list from `MARKETPLACES` below, so registering
 * a marketplace puts its hosts under the lint WITHOUT the test being edited.
 */
export const MARKETPLACES: readonly MarketplaceAdapter[] = [wbAdapter, ozonAdapter];

/** The adapter with that id, or `undefined`. The caller decides what a miss means. */
export const adapterFor = (id: string): MarketplaceAdapter | undefined =>
  MARKETPLACES.find((adapter) => adapter.id === id);

/** The adapter with that id, or a throw naming what is registered. */
export const requireAdapter = (id: string): MarketplaceAdapter => {
  const adapter = adapterFor(id);
  if (!adapter) {
    throw new Error(
      `Unknown marketplace ${id}. Registered: ${MARKETPLACES.map((entry) => entry.id).join(", ")}.`,
    );
  }
  return adapter;
};

/** Every id, in registry order. */
export const MARKETPLACE_IDS: readonly MarketplaceId[] = MARKETPLACES.map((adapter) => adapter.id);

/**
 * Every host suffix any adapter may reach, deduplicated. This is what the repo
 * lint scans for, which is why a new adapter needs no edit there.
 */
export const MARKETPLACE_HOST_SUFFIXES: readonly string[] = [
  ...new Set(MARKETPLACES.flatMap((adapter) => adapter.hostSuffixes)),
];

/**
 * The mutation deny-lists, indexed by adapter id.
 *
 * This is a VIEW of the lists the adapters declare, never a second copy of
 * them: the WB list is read out of the saved documentation index in
 * `modules/wb/mutations.ts`, the Ozon list is derived from `OZON_WRITE_PATHS`
 * in `modules/ozon/endpoints.ts`, which is the same list `credentials.ts`
 * decides `readOnly` from. Two copies of one list drift; this one cannot.
 */
export const MUTATION_DENY_LIST: Readonly<Record<string, readonly MutationEntry[]>> =
  Object.fromEntries(MARKETPLACES.map((adapter) => [adapter.id, adapter.mutationDenyList]));
