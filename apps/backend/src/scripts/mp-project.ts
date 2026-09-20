import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { MARKETPLACE_IDS } from "../modules/marketplace/registry";
import { projectFromMirrors } from "../modules/marketplace/project";

/**
 * Recomputes the normalized `mp_*` layer of one shop from the raw mirrors
 * (w12-marketplace-core).
 *
 *   MP_TENANT=cherkashino pnpm --filter backend mp:project
 *   MP_TENANT=cherkashino MP_MARKETPLACE=wb pnpm --filter backend mp:project
 *
 * It spends no marketplace request and needs no key: everything it reads is
 * already in `wb_*` / `ozon_*`. Running it twice gives the same counts, which
 * is the property the projector exists to have — a normalisation found wrong
 * is fixed and replayed, never re-imported (spec 2.1).
 *
 * The marketplaces come from `registry.ts`, so a third adapter is covered here
 * without a line being edited.
 */
export default async function mpProject({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const env = process.env;
  const positional = (args ?? []).filter((arg) => !arg.startsWith("-"));
  const handle = env.MP_TENANT ?? positional[0] ?? null;
  const wanted = env.MP_MARKETPLACE ?? positional[1] ?? "all";

  if (!handle) {
    logger.error(
      "mp:project: name the shop: MP_TENANT=<handle> [MP_MARKETPLACE=<" +
        `${MARKETPLACE_IDS.join("|")}|all>] pnpm --filter backend mp:project`,
    );
    process.exitCode = 1;
    return;
  }

  const marketplaces =
    wanted === "all" ? [...MARKETPLACE_IDS] : wanted.split(",").map((one) => one.trim());

  const unknown = marketplaces.filter((one) => !MARKETPLACE_IDS.includes(one as never));
  if (unknown.length) {
    logger.error(
      `mp:project: unknown marketplace ${unknown.join(", ")}. Registered: ${MARKETPLACE_IDS.join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [tenant] = (await tenantModule.listTenants({ handle })) as unknown as {
    id: string;
    handle: string;
  }[];

  if (!tenant) {
    logger.error(`mp:project: no shop with handle ${handle} on this stand.`);
    process.exitCode = 1;
    return;
  }

  let failed = false;

  for (const marketplace of marketplaces) {
    const result = await projectFromMirrors(
      { container, tenantId: tenant.id, logger },
      marketplace,
    );

    logger.info(
      `mp:project: ${marketplace} ${result.status} — ` +
        Object.entries(result.counts)
          .map(([name, count]) => `${name} ${count}`)
          .join(", "),
    );
    logger.info(`mp:project: ${marketplace} — ${result.linkSummary}`);

    if (result.link.accountedFor !== result.link.total) {
      /**
       * Every card has to land in exactly one bucket. If this ever fires, the
       * matcher lost a card silently, which is the failure `link.ts` is
       * written to prevent.
       */
      logger.error(
        `mp:project: ${marketplace} — ${result.link.total} карточек, а по корзинам разложено ` +
          `${result.link.accountedFor}. Это баг сопоставления.`,
      );
      failed = true;
    }

    if (result.status === "failed") {
      logger.error(`mp:project: ${marketplace} failed: ${result.error}`);
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}
