import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Offers Robokassa in every region priced in RUB (t03-tenant-secrets-robokassa).
 *
 * Regions are shared by every shop on the backend and a payment provider is
 * offered per region (`region.payment_providers`), so the platform links
 * `pp_robokassa_robokassa` to the RUB regions once; whether a GIVEN shop can
 * take money through it is decided per request from the shop's own
 * credentials (`src/api/store/payment-providers/route.ts`). Idempotent: a
 * region that already lists the provider is left alone.
 *
 *   npx medusa exec ./src/scripts/link-robokassa-regions.ts
 */
export default async function linkRobokassaRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const regionModule = container.resolve(Modules.REGION);

  const providerId = "pp_robokassa_robokassa";
  const regions = await regionModule.listRegions({ currency_code: "rub" }, { select: ["id", "name"] });

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
      logger.info(`[robokassa] region ${region.name} (${region.id}) already offers ${providerId}`);
      continue;
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, providerId] },
      },
    });
    logger.info(`[robokassa] region ${region.name} (${region.id}): linked ${providerId}`);
  }

  logger.info(`[robokassa] done, ${regions.length} RUB region(s) checked`);
}
