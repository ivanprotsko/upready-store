import type {
  MarketplaceAdapter,
  MutationEntry,
  ReadEndpoint,
} from "./contract";
import { ADAPTER_KEYS } from "./contract";

/**
 * The shared validator behind the read-only invariant (w12-marketplace-core).
 *
 * `modules/wb/endpoints.ts` and `modules/ozon/endpoints.ts` each grew their
 * own copy of these checks (PR #71, PR #79). Two copies of one rule is one
 * rule the third adapter forgets (rule 20), so this file is the copy that
 * counts: every adapter runs it at module load, and the conformance suite
 * runs it again over the live registry plus hand-built bad entries.
 *
 * Nothing here is configurable and nothing takes a flag. A check that can be
 * turned off is not a check.
 */

/** Thrown before any socket is opened. Names the offender, never a key. */
export class MarketplaceGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceGuardError";
  }
}

/** The only verbs a registry entry may carry. */
const READ_METHODS = new Set(["GET", "POST"]);

/**
 * `{warehouseId}` in the documentation is `:warehouseId` in a registry entry.
 * Both spellings have to compare equal, or a deny-list copied from the docs
 * would silently miss the entry it was written for.
 */
export const normalisePath = (path: string): string =>
  path
    .replace(/\{([A-Za-z0-9_]+)\}/g, ":$1")
    .replace(/:[A-Za-z0-9_]+/g, ":param")
    .replace(/\/+$/, "");

/**
 * The deny-list entry a (method, path) pair falls under, or `null`.
 *
 * Placeholders are compared by POSITION, not by name: WB documents
 * `/api/v3/stocks/{warehouseId}` while the registry writes
 * `/api/v3/stocks/:warehouseId`, and a rename of that parameter must not open
 * a hole.
 */
export const deniedBy = (
  method: string,
  path: string,
  denyList: readonly MutationEntry[],
): MutationEntry | null => {
  const wanted = normalisePath(path);
  for (const entry of denyList) {
    if (normalisePath(entry.path) !== wanted) {
      continue;
    }
    if (entry.method === "*" || entry.method === method) {
      return entry;
    }
  }
  return null;
};

/**
 * Checks one registry against one adapter's rules. Called at the bottom of
 * every adapter file, so a bad entry fails the process at boot rather than at
 * the first sync, and called again by the conformance suite with hand-built
 * entries that MUST be refused.
 *
 * `entries` is a parameter rather than read off the adapter so the suite can
 * feed it a deliberately broken registry without building a whole adapter.
 */
export const validateEndpointRegistry = (
  adapter: Pick<MarketplaceAdapter, "id" | "hostSuffixes" | "mutationDenyList">,
  entries: readonly ReadEndpoint[],
): void => {
  const seen = new Set<string>();
  const where = `marketplace ${adapter.id}`;

  if (!adapter.hostSuffixes.length) {
    throw new MarketplaceGuardError(
      `${where} declares no hostSuffixes, so every host would be foreign or none would. ` +
        "An adapter names the hosts it may reach.",
    );
  }

  for (const entry of entries) {
    if (!entry.id) {
      throw new MarketplaceGuardError(`An endpoint of ${where} has no id.`);
    }
    if (seen.has(entry.id)) {
      throw new MarketplaceGuardError(`Duplicate endpoint id ${entry.id} in ${where}.`);
    }
    seen.add(entry.id);

    if (!READ_METHODS.has(entry.method)) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} declares method ${entry.method}. Only GET and ` +
          "documented read POSTs can be registered: no adapter writes to a marketplace.",
      );
    }

    if (entry.method === "POST" && !entry.readViaPost?.docUrl) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} is a POST without readViaPost.docUrl. A POST is only ` +
          "registrable when the marketplace's own documentation defines it as a query with a " +
          "body; cite the page.",
      );
    }

    if (entry.method === "POST" && !entry.readViaPost?.reason) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} is a POST without readViaPost.reason. Quote the ` +
          "method's own sentence, so a reviewer can check the claim without opening the portal.",
      );
    }

    if (entry.method === "GET" && entry.readViaPost) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} is a GET carrying readViaPost. That field marks a POST read only.`,
      );
    }

    if (entry.host.includes("/") || entry.host.includes(":")) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} names host ${entry.host}, which is not a bare host name.`,
      );
    }

    if (!adapter.hostSuffixes.some((suffix) => entry.host.endsWith(suffix))) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} names host ${entry.host}, which ends with none of ` +
          `${adapter.hostSuffixes.join(", ")}.`,
      );
    }

    if (!entry.path.startsWith("/")) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} has a path that is not absolute: ${entry.path}.`,
      );
    }

    if (!entry.docUrl) {
      throw new MarketplaceGuardError(`Endpoint ${entry.id} of ${where} cites no documentation page.`);
    }

    const denied = deniedBy(entry.method, entry.path, adapter.mutationDenyList);
    if (denied) {
      throw new MarketplaceGuardError(
        `Endpoint ${entry.id} of ${where} registers ${entry.method} ${entry.path}, which the ` +
          `documentation calls a mutation ("${denied.summary}", ${denied.docUrl}). ` +
          "A path that writes cannot be registered as a read.",
      );
    }
  }
};

/**
 * The whole adapter, not just its registry. Run at module load next to
 * `validateEndpointRegistry`, and again by the conformance suite over every
 * adapter in `MARKETPLACES`.
 *
 * The key-set check is the one that catches an escape hatch: an adapter that
 * grows a `rawRequest`, a `baseUrl` or a `fetch` member fails here by the fact
 * of having it, before anybody has to notice it in a diff.
 */
export const validateAdapterShape = (adapter: MarketplaceAdapter): void => {
  const keys = Object.keys(adapter).sort();
  const expected: string[] = [...ADAPTER_KEYS].sort();

  const extra = keys.filter((key) => !expected.includes(key));
  if (extra.length) {
    throw new MarketplaceGuardError(
      `Adapter ${adapter.id} carries members the contract does not define: ${extra.join(", ")}. ` +
        "The contract is the whole surface; an extra member is an escape hatch by another name.",
    );
  }

  const missing = expected.filter((key) => !keys.includes(key));
  if (missing.length) {
    throw new MarketplaceGuardError(
      `Adapter ${adapter.id} is missing contract members: ${missing.join(", ")}.`,
    );
  }

  if (!adapter.mutationDenyList.length) {
    throw new MarketplaceGuardError(
      `Adapter ${adapter.id} declares an empty mutationDenyList. Every marketplace this ` +
        "repository talks to documents mutations; an empty list means nobody read the docs.",
    );
  }

  /**
   * `mirrorKinds` names this adapter's OWN import kinds, so a value that is
   * not one of them is a typo that would otherwise surface as "nothing to
   * import" on a screen months later (w18-mp-reviews-desk).
   */
  for (const [kind, importKinds] of Object.entries(adapter.mirrorKinds)) {
    for (const importKind of importKinds) {
      if (!adapter.syncKinds.includes(importKind)) {
        throw new MarketplaceGuardError(
          `Adapter ${adapter.id} maps normalized kind ${kind} to import kind ${importKind}, ` +
            `which is not one of its syncKinds (${adapter.syncKinds.join(", ")}).`,
        );
      }
    }
  }

  for (const entry of adapter.mutationDenyList) {
    if (!entry.path.startsWith("/") || !entry.summary || !entry.docUrl) {
      throw new MarketplaceGuardError(
        `Adapter ${adapter.id} has a deny-list entry without a path, a title or a doc URL: ` +
          `${JSON.stringify(entry)}. The list is evidence, not a memory (rule 17a).`,
      );
    }
  }
};

/** Both checks, in the order an adapter file runs them at load. */
export const validateAdapter = (adapter: MarketplaceAdapter): void => {
  validateAdapterShape(adapter);
  validateEndpointRegistry(adapter, adapter.endpoints);
};
