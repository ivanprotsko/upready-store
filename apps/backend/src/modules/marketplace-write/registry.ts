import {
  MARKETPLACE_WRITE_METHODS,
  MARKETPLACE_WRITE_OP_CLASSES,
  MarketplaceWriteRegistryError,
  type MarketplaceWriteAdapter,
  type MarketplaceWriteEndpoint,
} from "./types";

/**
 * The allow-list check (w20-wb-write-core).
 *
 * Same shape as the read registry of w01 and for the same reason: on a
 * marketplace the verb does not decide what a call does, so only an exact
 * (method, path) pair somebody read in the documentation may leave this
 * process. What w01 forbids — every write verb — this file REQUIRES, because
 * a read has no business travelling through the write transport either.
 *
 * Called at module load by each adapter, so a bad entry fails the process at
 * boot rather than at the first mutation.
 */

const METHODS = new Set<string>(MARKETPLACE_WRITE_METHODS);
const OP_CLASSES = new Set<string>(MARKETPLACE_WRITE_OP_CLASSES);

export const validateWriteRegistry = (
  entries: readonly MarketplaceWriteEndpoint[],
  options: { marketplace: string; hostSuffix: string },
): void => {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.id) {
      throw new MarketplaceWriteRegistryError("A marketplace write entry has no id.");
    }
    if (seen.has(entry.id)) {
      throw new MarketplaceWriteRegistryError(`Duplicate marketplace write id ${entry.id}.`);
    }
    seen.add(entry.id);

    if (entry.marketplace !== options.marketplace) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} says marketplace ${entry.marketplace}, but it is registered by ` +
          `${options.marketplace}. The value reaches every audit row, so it may not drift.`,
      );
    }

    if (!METHODS.has(entry.method)) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} declares method ${entry.method}. Only ` +
          `${MARKETPLACE_WRITE_METHODS.join(", ")} are mutations; a read belongs in the read module.`,
      );
    }

    if (!OP_CLASSES.has(entry.opClass)) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} declares op class ${entry.opClass}, which nobody can consent to. ` +
          `The classes are ${MARKETPLACE_WRITE_OP_CLASSES.join(", ")}.`,
      );
    }

    if (!entry.host.endsWith(options.hostSuffix) || entry.host.includes("/")) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} names host ${entry.host}, which is not a *${options.hostSuffix} host.`,
      );
    }

    if (!entry.path.startsWith("/")) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} has a path that is not absolute.`,
      );
    }

    if (!entry.docUrl) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} cites no documentation page. An entry nobody can check against the ` +
          "marketplace's own docs is not registrable.",
      );
    }

    if (!entry.summary) {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} carries no summary. The owner's consent dialog quotes it.`,
      );
    }

    if (!entry.bodySchema || typeof (entry.bodySchema as { safeParse?: unknown }).safeParse !== "function") {
      throw new MarketplaceWriteRegistryError(
        `Write entry ${entry.id} has no usable bodySchema. A payload nobody validates is a payload ` +
          "nobody reviewed.",
      );
    }
  }
};

/**
 * The adapter's own invariants, checked next to its registry. The one that
 * matters: an adapter may not write with the credential it reads with.
 */
export const validateAdapter = (adapter: MarketplaceWriteAdapter): void => {
  if (!adapter.marketplace || !adapter.credentialSlot || !adapter.liveEnvVar) {
    throw new MarketplaceWriteRegistryError(
      "A write adapter needs a marketplace, a credential slot and a live env var.",
    );
  }

  if (adapter.forbiddenSlots.includes(adapter.credentialSlot)) {
    throw new MarketplaceWriteRegistryError(
      `Adapter ${adapter.marketplace} writes with slot ${adapter.credentialSlot}, which it also ` +
        "lists as forbidden. The write credential is a SEPARATE secret from the read one " +
        "(Ivan's order 2026-09-16 02:46 WITA); the two may not be the same slot.",
    );
  }

  validateWriteRegistry(adapter.endpoints, {
    marketplace: adapter.marketplace,
    hostSuffix: adapter.hostSuffix,
  });
};

/**
 * The entry a caller named. A miss is a refusal and not a "not found": an
 * unregistered mutation is precisely what this module exists to refuse.
 */
export const resolveWriteEndpoint = (
  adapter: MarketplaceWriteAdapter,
  endpointId: string,
): MarketplaceWriteEndpoint => {
  const entry = adapter.endpoints.find((candidate) => candidate.id === endpointId);
  if (!entry) {
    throw new MarketplaceWriteRegistryError(
      `Write endpoint ${endpointId} is not registered for ${adapter.marketplace}. Only mutations ` +
        "listed in the adapter's registry can be expressed at all.",
    );
  }
  return entry;
};

/** Every registered class, for the panel's consent list. */
export const registeredOpClasses = (adapter: MarketplaceWriteAdapter): string[] =>
  [...new Set(adapter.endpoints.map((entry) => entry.opClass))].sort();
