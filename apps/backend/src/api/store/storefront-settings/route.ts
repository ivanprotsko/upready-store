import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import type { IStoreModuleService } from "@medusajs/framework/types";

import { validate, type StorefrontSettings } from "./validation";

/**
 * `GET`/`PUT /store/storefront-settings` — the site-wide block-composition document
 * plus the default light/dark mode, read by every visitor and written only by the
 * operator through the storefront's hidden settings panel.
 *
 * Contract: `artifacts/docs/2026-09-09-panel-composition-mockup.md` §C1/§C2. Runs
 * behind Medusa's global publishable-key gate on the whole `/store` namespace
 * (`ensurePublishableApiKeyMiddleware`, applied via `app.use("/store", ...)` in
 * `@medusajs/framework`'s `ApiLoader.load()` BEFORE this repo's own
 * `defineMiddlewares()` routes are registered — there is no `matcher` a local
 * `middlewares.ts` could add that would run early enough to exempt this route, so a
 * `PUT` here needs `x-publishable-api-key` exactly like every other `/store/*` call,
 * same as `GET`). The `x-storefront-settings-secret` header below is the SEPARATE
 * write gate — the publishable key alone would let any storefront visitor write.
 */

const SECRET_HEADER = "x-storefront-settings-secret";

async function readStore(req: MedusaRequest) {
  const storeModuleService: IStoreModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores();
  return { storeModuleService, store };
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { store } = await readStore(req);
  const metadata = (store?.metadata ?? {}) as Record<string, unknown>;
  const settings = (metadata.storefrontSettings as StorefrontSettings | undefined) ?? null;
  res.status(200).json({ settings });
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const configuredSecret = process.env.STOREFRONT_SETTINGS_SECRET;
  const providedSecret = req.headers[SECRET_HEADER];

  if (
    !configuredSecret ||
    typeof providedSecret !== "string" ||
    providedSecret !== configuredSecret
  ) {
    res.status(401).json({
      error: "unauthorized",
      message: `A valid ${SECRET_HEADER} header is required to write storefront settings.`,
    });
    return;
  }

  const result = validate(req.body);

  if (!result.ok && result.kind === "invalid_field") {
    res.status(400).json({ error: "invalid_field", errors: result.errors });
    return;
  }

  if (!result.ok && result.kind === "forbidden_combination") {
    res.status(422).json({
      error: "forbidden_combination",
      field: result.rule.field,
      value: result.rule.value,
      against: result.rule.against,
      againstValue: result.rule.againstValue,
      reason: result.rule.reason,
    });
    return;
  }

  if (!result.ok) {
    // Exhaustiveness guard: validate() only ever returns the two kinds above when
    // ok is false. Unreachable in practice, kept so a future third `kind` fails
    // loudly here instead of silently 200ing an unvalidated document.
    res.status(500).json({ error: "unknown_validation_failure" });
    return;
  }

  const { storeModuleService, store } = await readStore(req);
  if (!store) {
    res.status(500).json({ error: "no_store", message: "No Store row exists on this backend." });
    return;
  }

  const settings: StorefrontSettings = {
    ...result.value,
    updatedAt: new Date().toISOString(),
  };

  const existingMetadata = (store.metadata ?? {}) as Record<string, unknown>;
  await storeModuleService.updateStores(store.id, {
    metadata: { ...existingMetadata, storefrontSettings: settings },
  });

  res.status(200).json({ settings });
}
