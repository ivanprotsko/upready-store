import {
  AbstractFulfillmentProviderService,
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentOption,
  Logger,
} from "@medusajs/framework/types";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import {
  cartWeightGrams,
  cityPoints,
  isPochtaMethodData,
  requestedPoint,
  type PochtaMethodData,
  type PochtaShippingMethodData,
  type PochtaStorePoint,
  type QuoteItem,
} from "../../pochta/method";
import { directoryBuyerPoints, findPochtaPoint, quoteToPoint, type PochtaQuote } from "../../pochta/quote";
import { pochtaApiCredentials, readPochtaSecret } from "../../tenant-secrets/pochta";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

/**
 * The store API's answer when the buyer's city has no Russian Post pickup point
 * (t-2026-10-14-58). The leading code is the contract with the storefront
 * (`lib/data/fulfillment.ts`), which shows its own translated sentence for it.
 */
export const POCHTA_NO_POINTS =
  "pochta_no_points: В этом населённом пункте нет пунктов выдачи Почты России";

type CartContext = {
  shipping_address?: { city?: string | null; postal_code?: string | null; province?: string | null } | null;
  items?: Array<{
    quantity: number;
    unit_price: number;
    variant?: { weight?: number | null; product?: { weight?: number | null } | null } | null;
    product?: { weight?: number | null } | null;
  }>;
};

/** Cart items as the weight arithmetic reads them. */
export const quoteItemsOf = (context: unknown): QuoteItem[] =>
  ((context as CartContext)?.items ?? []).map((item) => ({
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    weight: item.variant?.weight ?? null,
    product_weight: item.product?.weight ?? item.variant?.product?.weight ?? null,
  }));

/**
 * Fulfillment provider for Russian Post pickup points (46df-pochta).
 *
 * It prices and it records; it never ships. `createFulfillment` returns the
 * method data unchanged, so the owner creates the shipment in the carrier's
 * own cabinet with the point the order carries, and nothing here calls a
 * write endpoint of the «Отправка» API.
 */
class PochtaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "pochta";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;

  constructor(container: InjectedDependencies) {
    super();
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "pochta-pickup" }];
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return isPochtaMethodData(data.data);
  }

  /**
   * What Medusa stores on the cart's shipping method. The storefront sends the
   * point's index and kind; the name, the address and the price come from the
   * carrier's directory and a fresh quote, never from the client. A method
   * without a point is refused here with a sentence the buyer can act on —
   * a `MedusaError`, because a bare `Error` reaches the storefront as HTTP 500
   * (measured for CDEK on 2026-09-16).
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!isPochtaMethodData(optionData)) {
      return data;
    }
    const requested = requestedPoint(data);
    if (!requested) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите пункт выдачи Почты России");
    }
    const resolved = await this.resolve(optionData, requested, context);

    const result: PochtaShippingMethodData = {
      provider: "pochta",
      tenant_id: optionData.tenant_id,
      kind: "pickup",
      pochta_point_index: resolved.point.index,
      pochta_point_kind: resolved.point.kind,
      pochta_point_name:
        resolved.point.kind === "office" && typeof data.pochta_point_name === "string"
          ? data.pochta_point_name.slice(0, 200)
          : resolved.point.name,
      pochta_point_address:
        resolved.point.kind === "office" && typeof data.pochta_point_address === "string"
          ? data.pochta_point_address.slice(0, 300)
          : resolved.point.address,
      pochta_point_city: resolved.point.city,
      pochta_point_region: resolved.point.region,
      tariff_source: resolved.quote.tariff_source,
      carrier_amount: resolved.quote.carrier_amount,
      period_min: resolved.quote.period_min,
      period_max: resolved.quote.period_max,
      term_label: resolved.quote.term_label,
      weight_g: resolved.quote.weight_g,
    };
    return result as unknown as Record<string, unknown>;
  }

  /**
   * Priced to the chosen point when the method data names one, otherwise to
   * the first point the sheet offers for the buyer's city (the card in the
   * method list). Before t-2026-10-14-58 the card was priced to the buyer's own
   * postcode, a price no offered point had: on the live shop on 14.10, for
   * с. Константиново (391103) the card said 487 ₽, the village has no point,
   * and a point in Рязань cost 426 ₽. A throw leaves the card without a price.
   */
  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    if (!isPochtaMethodData(optionData)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Shipping option data is not a Russian Post method");
    }
    const requested = requestedPoint(data);
    let quote: PochtaQuote | null;
    if (requested) {
      quote = (await this.resolve(optionData, requested, context)).quote;
    } else {
      quote = await this.quoteForFirstPoint(optionData, context);
    }
    if (!quote) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Почта России не рассчитала доставку по этому адресу");
    }
    // Same flag as the CDEK provider, so the buyer pays exactly the number the card shows.
    return { calculated_amount: quote.amount, is_calculated_price_tax_inclusive: false };
  }

  async createFulfillment(data: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    // Nothing is registered with the carrier: the owner ships from the
    // «Отправка» cabinet, and the fulfillment keeps the point for the owner.
    return { data: { ...(data ?? {}) }, labels: [] };
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { ...(data ?? {}) };
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    return { data: {}, labels: [] };
  }

  /* ------------------------------------------------------------ internals */

  protected async credentials(optionData: PochtaMethodData) {
    const secret = await readPochtaSecret(this.pg_, optionData.tenant_id);
    const credentials = pochtaApiCredentials(secret);
    if (!secret || !credentials) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Почта России не подключена в этом магазине");
    }
    return { secret, credentials };
  }

  protected weight(optionData: PochtaMethodData, context: unknown, fallback: number): number {
    return cartWeightGrams(quoteItemsOf(context), optionData.default_weight_g || fallback);
  }

  protected async resolve(
    optionData: PochtaMethodData,
    requested: { index: string; kind: "pvz" | "office" },
    context: unknown,
  ) {
    const { secret, credentials } = await this.credentials(optionData);
    const point = await findPochtaPoint(credentials, requested);
    if (!point) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Этот пункт выдачи Почты России больше не принимает посылки: выберите другой",
      );
    }
    const weight = this.weight(optionData, context, secret.credentials.default_weight_g);
    if (point.weight_limit_g && weight > point.weight_limit_g) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Посылка тяжелее, чем принимает этот пункт выдачи: выберите другой",
      );
    }
    try {
      const quote = await quoteToPoint(
        { credentials, sender_index: secret.credentials.sender_index, point, weight_g: weight },
        { logger: this.logger_ },
      );
      return { point, quote };
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Почта России не рассчитала доставку: ${(error as Error).message}`,
      );
    }
  }

  /**
   * The card's price before a point is chosen: one quote, to the first point of
   * `cityPoints` — the list the sheet opens with, read from the directory the
   * client caches for six hours. So the card costs the carrier no more requests
   * than the quote to the address it replaces. A city with no point is
   * {@link POCHTA_NO_POINTS}, a reason the buyer can act on: the sheet still
   * finds points in another city. Anything else that fails is «no price».
   */
  protected async quoteForFirstPoint(optionData: PochtaMethodData, context: unknown): Promise<PochtaQuote | null> {
    const secret = await readPochtaSecret(this.pg_, optionData.tenant_id);
    const credentials = pochtaApiCredentials(secret);
    if (!secret || !credentials) return null;
    const city = (context as CartContext)?.shipping_address?.city?.trim();
    if (!city) return null;
    let first: PochtaStorePoint | undefined;
    try {
      first = cityPoints(await directoryBuyerPoints(credentials), city)[0];
    } catch (error) {
      this.logger_?.warn(`[pochta] no directory for the card: ${(error as Error).message}`);
      return null;
    }
    if (!first) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, POCHTA_NO_POINTS);
    }
    try {
      return await quoteToPoint(
        {
          credentials,
          sender_index: secret.credentials.sender_index,
          point: first,
          weight_g: this.weight(optionData, context, secret.credentials.default_weight_g),
        },
        { logger: this.logger_ },
      );
    } catch (error) {
      this.logger_?.warn(`[pochta] no quote for the card: ${(error as Error).message}`);
      return null;
    }
  }
}

export default PochtaFulfillmentService;
