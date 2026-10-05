import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { BITCART_PROVIDER_ID } from "../bitcart/session";

/**
 * The currencies a Bitcart invoice is first offered in, the same two as
 * BTCPay's (`link-btcpay-regions.ts`). Bitcart prices an invoice in any fiat
 * currency its rate provider knows; widen this list once a shop needs another.
 */
export const BITCART_REGION_CURRENCIES = ["usd", "eur"] as const;

/**
 * Offers Bitcart in every region priced in USD or EUR, the idempotent
 * per-region link `link-btcpay-regions.ts` does for BTCPay
 * (ask-20261005-070255-438f, stage 2).
 *
 * Run by hand on the INTL instance only, never from `docker-entrypoint.sh`:
 * Bitcart is forbidden on the RU instance (`deploy/instances/ru.json`). A
 * linked region still shows Bitcart to no buyer until a shop's owner saves and
 * switches on a Bitcart store (`/store/payment-providers` hides it otherwise).
 *
 *   npx medusa exec ./src/scripts/link-bitcart-regions.ts
 */
export default async function linkBitcartRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const regionModule = container.resolve(Modules.REGION);

  const regions = await regionModule.listRegions(
    { currency_code: { $in: [...BITCART_REGION_CURRENCIES] } },
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

    if (current.includes(BITCART_PROVIDER_ID)) {
      logger.info(`[bitcart] region ${region.name} (${region.id}) already offers ${BITCART_PROVIDER_ID}`);
      continue;
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, BITCART_PROVIDER_ID] },
      },
    });
    logger.info(`[bitcart] region ${region.name} (${region.id}): linked ${BITCART_PROVIDER_ID}`);
  }

  logger.info(`[bitcart] done, ${regions.length} region(s) in usd/eur checked`);
}
