import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { X402_PROVIDER_ID } from "../x402/session";

/**
 * Offers x402 in every region priced in USD (t-2026-10-03-33), the idempotent
 * per-region link `link-btcpay-regions.ts` does for BTCPay. USD only, because
 * USDC is a dollar and the provider refuses any other cart currency.
 *
 * Run by hand on the INTL instance only, never from `docker-entrypoint.sh`:
 * x402 is forbidden on the RU instance (`deploy/instances/ru.json`). A linked
 * region still shows x402 to no buyer until a shop's owner saves and switches
 * it on (`/store/payment-providers` hides it otherwise).
 *
 *   npx medusa exec ./src/scripts/link-x402-regions.ts
 */
export default async function linkX402Regions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const regionModule = container.resolve(Modules.REGION);

  const regions = await regionModule.listRegions({ currency_code: "usd" }, { select: ["id", "name"] });

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

    if (current.includes(X402_PROVIDER_ID)) {
      logger.info(`[x402] region ${region.name} (${region.id}) already offers ${X402_PROVIDER_ID}`);
      continue;
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, X402_PROVIDER_ID] },
      },
    });
    logger.info(`[x402] region ${region.name} (${region.id}): linked ${X402_PROVIDER_ID}`);
  }

  logger.info(`[x402] done, ${regions.length} region(s) in usd checked`);
}
