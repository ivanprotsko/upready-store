import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";
import { BTCPAY_PROVIDER_ID } from "../btcpay/session";

/**
 * The currencies a BTCPay invoice is first offered in: the two the research
 * planned for (ask-20261005-070255-438f, `payment-flow.md`). BTCPay prices an
 * invoice in any fiat currency its store has a rate for; widen this list once
 * a shop needs another one.
 */
export const BTCPAY_REGION_CURRENCIES = ["usd", "eur"] as const;

/**
 * Offers BTCPay in every region priced in USD or EUR, the idempotent
 * per-region link `link-tribute-regions.ts` does for Tribute.
 *
 * Run by hand on the INTL instance only, never from `docker-entrypoint.sh`:
 * BTCPay is forbidden on the RU instance (`deploy/instances/ru.json`). A linked
 * region still shows BTCPay to no buyer until a shop's owner saves and
 * switches on a BTCPay store (`/store/payment-providers` hides it otherwise).
 *
 *   npx medusa exec ./src/scripts/link-btcpay-regions.ts
 */
export default async function linkBtcpayRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const regionModule = container.resolve(Modules.REGION);

  const regions = await regionModule.listRegions(
    { currency_code: { $in: [...BTCPAY_REGION_CURRENCIES] } },
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

    if (current.includes(BTCPAY_PROVIDER_ID)) {
      logger.info(`[btcpay] region ${region.name} (${region.id}) already offers ${BTCPAY_PROVIDER_ID}`);
      continue;
    }

    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, BTCPAY_PROVIDER_ID] },
      },
    });
    logger.info(`[btcpay] region ${region.name} (${region.id}): linked ${BTCPAY_PROVIDER_ID}`);
  }

  logger.info(`[btcpay] done, ${regions.length} region(s) in usd/eur checked`);
}
