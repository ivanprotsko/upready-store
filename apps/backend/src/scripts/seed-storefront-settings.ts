import type { MedusaContainer } from "@medusajs/framework";
import type { IStoreModuleService, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";

import { resolveProfileDir } from "../migration-scripts/data/store-profile";

/**
 * Seeds this stand's per-profile default block composition into
 * `store.metadata.storefrontSettings` — the same document `GET`/`PUT
 * /store/storefront-settings` (`api/store/storefront-settings/route.ts`) reads and
 * writes, and the same shape `apps/storefront/src/lib/theme/composition.ts` calls
 * `StorefrontSettings`. Run once per stand, after the main seed:
 *
 *   npx medusa exec ./src/scripts/seed-storefront-settings.ts
 *
 * Contract: `2026-09-09-panel-composition-mockup.md` §C1 ("Absent (never saved)"),
 * `2026-09-09-block-port-map.md` §8 (the five primary compositions), and this
 * package's own task note (W8): "writes the per-profile default composition … into
 * `store.metadata.storefrontSettings` when it is absent". Idempotent — a stand that
 * already has a saved document (an operator already used the panel, or this script
 * already ran) is left untouched, never overwritten.
 *
 * `PROFILE_DEFAULTS` below is this script's own hand-transcription of
 * `apps/storefront/src/lib/theme/composition.ts`'s `PROFILE_DEFAULTS`, the same way
 * `api/store/storefront-settings/validation.ts` already transcribes the enums and
 * `FORBIDDEN` pairs independently on the backend side — there is no shared package
 * between the two apps to import a single copy from (`pnpm-workspace.yaml` lists
 * only `apps/**`, `composition.ts`'s own doc comment). Keep the two in sync by hand
 * whenever `composition-contract.json` or `composition.ts` changes; `sneakers`
 * intentionally deviates from `composition-contract.json`'s own `profileDefaults`
 * (hero `l`, which has no storefront schema at all — zero `frames` on any profile)
 * to hero `k`, the only hero fully implemented today — `composition.ts`'s own doc
 * comment on `PROFILE_DEFAULTS.sneakers` carries the full reasoning and the fork it
 * was reported under (`.ai/reports/C1.json`).
 */

type ProfileId = "sneakers" | "electronics" | "supplements" | "womens-fashion" | "home-goods";

type StorefrontSettingsInput = {
  defaultMode: "light" | "dark";
  header: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  hero: "none" | "g" | "h" | "j" | "k" | "l" | "m" | "ga" | "gb";
  tiles: "on" | "off";
  listing: "none" | "p1" | "p2" | "p3" | "p4" | "p5";
  footer: "none" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6";
};

const PROFILE_DEFAULTS: Record<ProfileId, StorefrontSettingsInput> = {
  sneakers: {
    defaultMode: "dark",
    header: "h5",
    hero: "k",
    tiles: "off",
    listing: "p2",
    footer: "f3",
  },
  electronics: {
    defaultMode: "dark",
    header: "h3",
    hero: "k",
    tiles: "on",
    listing: "p3",
    footer: "f5",
  },
  supplements: {
    defaultMode: "light",
    header: "h6",
    hero: "k",
    tiles: "off",
    listing: "p3",
    footer: "f6",
  },
  "womens-fashion": {
    defaultMode: "light",
    header: "h6",
    hero: "g",
    tiles: "off",
    listing: "p4",
    footer: "f6",
  },
  "home-goods": {
    defaultMode: "light",
    header: "h2",
    hero: "h",
    tiles: "on",
    listing: "p4",
    footer: "f4",
  },
};

function isKnownProfileId(id: string): id is ProfileId {
  return Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, id);
}

export default async function seedStorefrontSettings({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const resolved = resolveProfileDir();
  if (!resolved) {
    logger.info(
      "seed-storefront-settings: STORE_PROFILE is unset — nothing to seed (the default demo data carries no per-theme composition).",
    );
    return;
  }

  if (!isKnownProfileId(resolved.id)) {
    logger.warn(
      `seed-storefront-settings: STORE_PROFILE="${resolved.id}" has no entry in this script's PROFILE_DEFAULTS (the five launch profiles are sneakers, electronics, supplements, womens-fashion, home-goods) — nothing to seed.`,
    );
    return;
  }

  const storeModuleService: IStoreModuleService = container.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores();

  if (!store) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "seed-storefront-settings: no Store row exists on this backend. Run the main seed (`pnpm seed`) first.",
    );
  }

  const existingMetadata = (store.metadata ?? {}) as Record<string, unknown>;
  if (existingMetadata.storefrontSettings) {
    logger.info(
      `seed-storefront-settings: store.metadata.storefrontSettings is already set for "${resolved.id}" — left untouched.`,
    );
    return;
  }

  const settings = {
    ...PROFILE_DEFAULTS[resolved.id],
    updatedAt: new Date().toISOString(),
  };

  await storeModuleService.updateStores(store.id, {
    metadata: { ...existingMetadata, storefrontSettings: settings },
  });

  logger.info(
    `seed-storefront-settings: seeded the "${resolved.id}" default composition (header=${settings.header}, hero=${settings.hero}, tiles=${settings.tiles}, listing=${settings.listing}, footer=${settings.footer}, defaultMode=${settings.defaultMode}).`,
  );
}
