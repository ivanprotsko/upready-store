import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { MARKETPLACES, MARKETPLACE_IDS, requireAdapter } from "../modules/marketplace/registry";
import { projectFromMirrors } from "../modules/marketplace/project";
import type { MarketplaceAdapter, SyncDeps } from "../modules/marketplace/contract";

/**
 * Imports reviews and customer questions of one shop from every marketplace
 * it has a key for, and normalises them into `mp_review` / `mp_question`
 * (w18-mp-reviews-desk).
 *
 *   MP_TENANT=cherkashino pnpm --filter backend mp:reviews
 *   MP_TENANT=cherkashino MP_MARKETPLACE=wb pnpm --filter backend mp:reviews
 *   MP_TENANT=cherkashino MP_KIND=questions pnpm --filter backend mp:reviews
 *
 * WHICH IMPORTS RUN is read from the adapter, not from a list here:
 * `adapter.mirrorKinds.reviews` and `.questions` name the kinds in that
 * marketplace's own vocabulary (WB calls reviews `feedbacks`, Ozon calls them
 * `reviews`). A third marketplace is covered by being registered.
 *
 * ONE `mp_sync_run` PER KIND. Each import writes its own run row in the
 * adapter's log, the projector carries those rows into the shared
 * `mp_sync_run` on the same pass, and the projection itself is one more run
 * with `kind = 'projection'`. A run that was refused (`rate_limited`) or
 * failed keeps its row and its message: an import that did not happen has to
 * stay visible, or an empty desk reads as «отзывов нет» (rule 20a).
 *
 * READ-ONLY. Every request goes through the adapter's single I/O point, which
 * can send nothing but a registered read. Answering a review on the
 * marketplace is not implemented anywhere in this repository.
 */

type KindArg = "reviews" | "questions" | "all";

const normalizedKinds = (kind: KindArg): ("reviews" | "questions")[] =>
  kind === "all" ? ["reviews", "questions"] : [kind];

export default async function mpReviewsSync({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const env = process.env;
  const positional = (args ?? []).filter((arg) => !arg.startsWith("-"));
  const handle = env.MP_TENANT ?? positional[0] ?? null;
  const wantedMarketplace = env.MP_MARKETPLACE ?? positional[1] ?? "all";
  const wantedKind = (env.MP_KIND ?? positional[2] ?? "all") as KindArg;

  if (!handle) {
    logger.error(
      "mp:reviews: name the shop: MP_TENANT=<handle> [MP_MARKETPLACE=<" +
        `${MARKETPLACE_IDS.join("|")}|all>] [MP_KIND=<reviews|questions|all>] ` +
        "pnpm --filter backend mp:reviews",
    );
    process.exitCode = 1;
    return;
  }

  if (!["reviews", "questions", "all"].includes(wantedKind)) {
    logger.error(`mp:reviews: unknown kind ${wantedKind}. Known: reviews, questions, all.`);
    process.exitCode = 1;
    return;
  }

  const adapters: MarketplaceAdapter[] =
    wantedMarketplace === "all"
      ? [...MARKETPLACES]
      : wantedMarketplace.split(",").map((one) => requireAdapter(one.trim()));

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [tenant] = (await tenantModule.listTenants({ handle })) as unknown as {
    id: string;
    handle: string;
  }[];

  if (!tenant) {
    logger.error(`mp:reviews: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  let failed = false;

  for (const adapter of adapters) {
    const slot = await adapter.readCredentials(pg, tenant.id);

    /**
     * No key is not a failure of this script: it is the shop not having
     * connected that marketplace yet, and it is said in those words rather
     * than left as a silent zero in the desk.
     */
    if (!slot || !slot.isEnabled) {
      logger.warn(
        `mp:reviews: ${adapter.label} — у магазина ${handle} ` +
          `${slot ? "ключ сохранён, но подключение выключено" : "ключа нет"}. ` +
          "Импорт пропущен, что уже лежит в зеркалах — нормализуется ниже.",
      );
    } else {
      const deps: SyncDeps = {
        container,
        tenantId: tenant.id,
        credentials: slot.credentials,
        logger,
      };

      for (const normalized of normalizedKinds(wantedKind)) {
        const importKinds = adapter.mirrorKinds[normalized] ?? [];

        if (!importKinds.length) {
          logger.warn(
            `mp:reviews: ${adapter.label} не импортирует «${normalized}» вовсе ` +
              "(в mirrorKinds пусто) — это заявление адаптера, а не пропуск.",
          );
          continue;
        }

        for (const importKind of importKinds) {
          const outcome = await adapter.runSync(deps, importKind);
          logger.info(
            `mp:reviews: ${adapter.id}/${importKind} ${outcome.status} — ` +
              `${outcome.rows} строк, ${outcome.requests} запросов` +
              (outcome.error ? `, ошибка: ${outcome.error}` : "") +
              (outcome.retryAt ? `, повтор после ${outcome.retryAt.toISOString()}` : ""),
          );

          /**
           * `rate_limited` is not a defect of ours and not a success either:
           * the marketplace refused to serve this right now. It is reported as
           * itself and does not fail the run.
           */
          if (outcome.status === "failed") {
            failed = true;
          }
        }
      }
    }

    const projection = await projectFromMirrors(
      { container, tenantId: tenant.id, logger },
      adapter.id,
    );

    logger.info(
      `mp:reviews: ${adapter.id} проекция ${projection.status} — ` +
        `отзывов ${projection.counts.reviews}, вопросов ${projection.counts.questions}.`,
    );

    if (projection.status === "failed") {
      logger.error(`mp:reviews: ${adapter.id} проекция упала: ${projection.error}`);
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}
