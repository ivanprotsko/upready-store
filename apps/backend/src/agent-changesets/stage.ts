/**
 * The stage site of a shop (t-2026-10-27-04): a second site of the same group
 * where the owner's agent writes first. These are the names it is found by.
 *
 * The main site carries `metadata.stage_tenant_id`, the stage site carries
 * `metadata.stage_of` with the main site's id and `metadata.stage_host` with
 * its address. `ensure-stage-tenant` writes all three, and nothing else does.
 */

export const STAGE_OF_KEY = "stage_of";
export const STAGE_TENANT_KEY = "stage_tenant_id";
export const STAGE_HOST_KEY = "stage_host";

/** `STAGE_HOST_PREFIX`, `stage.` when unset: the stage site lives at `stage.<main's primary host>`. */
export const stageHostPrefix = (): string => {
  const raw = (process.env.STAGE_HOST_PREFIX ?? "").trim().toLowerCase();
  if (!raw) return "stage.";
  return raw.endsWith(".") ? raw : `${raw}.`;
};

export const stageHostFor = (primaryHost: string): string => `${stageHostPrefix()}${primaryHost.toLowerCase()}`;

const metadataValue = (metadata: unknown, key: string): string | null => {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
};

/** The main site's id when `metadata` is a stage site's, `null` otherwise. */
export const stageOf = (metadata: unknown): string | null => metadataValue(metadata, STAGE_OF_KEY);

export const isStageSite = (metadata: unknown): boolean => stageOf(metadata) !== null;

/** The stage site's id when `metadata` is a main site's that has one. */
export const stageTenantIdOf = (metadata: unknown): string | null => metadataValue(metadata, STAGE_TENANT_KEY);
