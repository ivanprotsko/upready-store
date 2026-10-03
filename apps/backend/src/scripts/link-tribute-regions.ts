import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { TRIBUTE_CURRENCIES } from "../tenant-secrets/tribute";

/**
 * Offers Tribute in every region priced in RUB, USD or EUR (t-cherk-22),
 * the same idempotent per-region link `link-robokassa-regions.ts` does for
 * Robokassa's RUB-only regions — Tribute additionally takes USD and EUR,
 * per the Shop API's three accepted currencies.
 *
 *   npx medusa exec ./src/scripts/link-tribute-regions.ts
 */
export default async function linkTributeRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const regionModule = container.resolve(Modules.REGION);

  const providerId = "pp_tribute_tribute";
  const regions = await regionModule.listRegions(
    { currency_code: { $in: [...TRIBUTE_CURRENCIES] } },
    { select: ["id", "name"] },
  );

  for (const region of regions) {
    const {
      data: [withProviders],
    } = await query.graph({
      entity: "region",
      fields: ["id", "payment_providers.id"],
      filters: { id: region.id },
    });
    const current = (withProviders?.payment_providers ?? [])
      .map((provider) => provider?.id)
      .filter((id): id is string => Boolean(id));

    if (current.includes(providerId)) {
      logger.info(`[tribute] region ${region.name} (${region.id}) already offers ${providerId}`);
      continue;
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, providerId] },
      },
    });
    logger.info(`[tribute] region ${region.name} (${region.id}): linked ${providerId}`);
  }

  logger.info(`[tribute] done, ${regions.length} region(s) in rub/usd/eur checked`);
}
