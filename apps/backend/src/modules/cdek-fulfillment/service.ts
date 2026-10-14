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
  CdekError,
  cdekErrorLogLine,
  createOrder,
  deleteOrder,
  listCities,
  listTariffs,
  type CdekCredentials,
  type CdekLocation,
} from "../../cdek/client";
import {
  cartSubtotal,
  cartWeightGrams,
  deliveryModeFor,
  isCdekMethodData,
  isPointKind,
  selectTariff,
  termLabel,
  type CdekMethodData,
  type QuoteItem,
} from "../../cdek/method";
import { packageItems } from "../../cdek/package-items";
import { cdekApiCredentials, readCdekSecret, type ResolvedCdekSecret } from "../../tenant-secrets/cdek";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

/**
 * What the cart's (and then the order's) shipping method keeps in `data`. The
 * client sends `cdek_point_code` when the buyer picked a pickup point; every
 * other field the server writes, so the order records enough to create the
 * shipment later without asking the carrier again.
 */
export type CdekShippingMethodData = {
  provider: "cdek";
  tenant_id: string;
  kind: CdekMethodData["kind"];
  cdek_point_code: string | null;
  cdek_point_name: string | null;
  tariff_code: number | null;
  tariff_name: string | null;
  period_min: number | null;
  period_max: number | null;
  term_label: string | null;
  carrier_amount: number | null;
  /**
   * Grams for a unit without a weight, copied from the option when the method
   * is set, so the shipment weighs what the price was quoted for
   * (t-2026-10-09-57). Absent on an order placed before it was kept.
   */
  default_weight_g?: number | null;
  /** Set by `createFulfillment`, read by the panel and the tracking link. */
  cdek_order_uuid?: string | null;
  cdek_number?: string | null;
};

const CART_CACHE_TTL_MS = 60_000;

/**
 * The store API's answer when CDEK's calculator refuses the buyer's address (t-2026-10-09-56).
 * The leading code is the contract with the storefront (`lib/data/fulfillment.ts`,
 * `CDEK_ADDRESS_REJECTED_CODE`), which shows its own translated sentence for it; the
 * Russian rest is for anyone reading the raw answer.
 */
export const CDEK_ADDRESS_REJECTED =
  "cdek_address_rejected: СДЭК не нашёл адрес — проверьте индекс и город";

/**
 * The store API's answer when CDEK prices the route but has no tariff that ends at
 * a point, which means the place has no CDEK office or locker (t-2026-10-14-58: on
 * the live shop on 14.10, с. Константиново, 391103, had CDEK's courier at 955 ₽ and
 * no point). The storefront reads the code and says so, where it used to say the
 * price could not be calculated.
 */
export const CDEK_NO_POINTS =
  "cdek_no_points: В этом населённом пункте нет пунктов выдачи СДЭК";

/**
 * Fulfillment provider for CDEK with per-tenant credentials
 * (i02-apiship-cdek-shipping).
 *
 * Why a direct CDEK client and not ApiShip or the gorgojs plugin: measured on
 * 2026-09-16, ApiShip's `POST /calculator` answers `tariffs: []` for this
 * account in every pickup/delivery combination while CDEK's own
 * `/calculator/tarifflist` answers 42 tariffs for the same route, and the
 * gorgojs provider resolves its credentials from one `medusa-config.ts`
 * registration configured in Medusa Admin, which a shop owner never sees. The
 * whole table is in `artifacts/docs/i02-apiship-cdek-shipping/decision.md`.
 *
 * Registered as provider `cdek`, so its id is `cdek_cdek`.
 */
class CdekFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "cdek";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;
  /**
   * `calculatePrice` is called once per option per cart read, so a checkout with
   * two CDEK methods asks CDEK for the same tariff list twice within
   * milliseconds. The cache is keyed by everything that changes a price, lives
   * for a minute, and is per process — it never crosses a tenant, because the
   * tenant id is part of the key.
   */
  protected readonly quoteCache_ = new Map<string, { at: number; tariffs: Awaited<ReturnType<typeof listTariffs>> }>();

  constructor(container: InjectedDependencies) {
    super();
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "cdek-courier" }, { id: "cdek-pickup" }, { id: "cdek-postamat" }];
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return isCdekMethodData(data.data);
  }

  /**
   * Medusa stores whatever this returns on the cart's shipping method, and the
   * storefront sends only `cdek_point_code`. Everything else is filled in from
   * the option and from a fresh quote, so the order carries the tariff it was
   * priced with rather than a name a later price change would contradict.
   *
   * A pickup method without a point is rejected here: the alternative is an
   * order CDEK cannot accept, discovered at fulfillment time by the owner.
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!isCdekMethodData(optionData)) {
      return data;
    }
    const pointCode = typeof data?.cdek_point_code === "string" ? data.cdek_point_code.trim() : "";
    if (isPointKind(optionData.kind) && !pointCode) {
      // A plain `Error` here reaches the storefront as HTTP 500 «An unknown
      // error occurred» (measured on the stand 2026-09-16), which tells the
      // buyer nothing. `MedusaError` maps to 400 and carries the sentence.
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите пункт выдачи СДЭК");
    }

    let quoted: Awaited<ReturnType<CdekFulfillmentService["quote"]>> = null;
    try {
      quoted = await this.quote(optionData, context as CalculateShippingOptionPriceContext);
    } catch (error) {
      // A quote is a nicety here, not the gate: the price the buyer accepted was
      // already produced by `calculatePrice`, and failing the whole
      // `setShippingMethod` because the carrier blinked would lose the cart.
      this.logger_?.warn(
        `[cdek] validateFulfillmentData could not re-quote: ${(error as Error).message}`,
      );
    }

    const result: CdekShippingMethodData = {
      provider: "cdek",
      tenant_id: optionData.tenant_id,
      kind: optionData.kind,
      cdek_point_code: pointCode || null,
      cdek_point_name:
        typeof data?.cdek_point_name === "string" && data.cdek_point_name.trim()
          ? data.cdek_point_name.trim()
          : null,
      tariff_code: quoted?.selected.tariff.tariff_code ?? optionData.tariff_code ?? null,
      tariff_name: quoted?.selected.tariff.tariff_name ?? null,
      period_min: quoted?.selected.period_min ?? null,
      period_max: quoted?.selected.period_max ?? null,
      term_label: quoted ? termLabel(quoted.selected.period_min, quoted.selected.period_max) : null,
      carrier_amount: quoted?.selected.carrier_amount ?? null,
      default_weight_g: optionData.default_weight_g ?? null,
    };
    return { ...data, ...result };
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    if (!isCdekMethodData(optionData)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Shipping option data is not a CDEK method",
      );
    }
    let quoted: Awaited<ReturnType<CdekFulfillmentService["quote"]>>;
    try {
      quoted = await this.quote(optionData, context);
    } catch (error) {
      throw this.calculatorRefusal(error, context);
    }
    if (!quoted) {
      // Medusa has no «this option does not serve this address» answer: a throw
      // leaves the card without a price, and the storefront locks it with its
      // reason (U-12) — better than a card priced at zero.
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "СДЭК не возит по этому адресу выбранным способом",
      );
    }
    return {
      calculated_amount: quoted.selected.amount,
      is_calculated_price_tax_inclusive: false,
    };
  }

  /**
   * t-2026-10-09-56, item 9: CDEK's calculator refusing the address with a 4xx (on the
   * live shop a five-digit postcode, 80571) used to escape as a plain `CdekError`, which
   * Medusa answers as 500 «An unknown error occurred», and the log kept only «answered
   * 400». Now the log line carries CDEK's own codes and texts with the buyer's address
   * cut out (`cdekErrorLogLine`), and the store API answers 400 with
   * {@link CDEK_ADDRESS_REJECTED}: the storefront reads its code and tells the buyer to
   * check the postcode and the city. Anything else (a 5xx, the auth call, a timeout)
   * goes on as it was.
   */
  protected calculatorRefusal(error: unknown, context: CalculateShippingOptionPriceContext): unknown {
    if (
      !(error instanceof CdekError) ||
      error.status === null ||
      error.status < 400 ||
      error.status >= 500 ||
      !error.path?.startsWith("/calculator/")
    ) {
      return error;
    }
    const address = (context as unknown as {
      shipping_address?: Record<string, string | null | undefined> | null;
    }).shipping_address;
    this.logger_?.warn(
      `[cdek] ${cdekErrorLogLine(error, [
        address?.postal_code,
        address?.city,
        address?.address_1,
        address?.address_2,
        address?.province,
      ])}`,
    );
    return new MedusaError(MedusaError.Types.INVALID_DATA, CDEK_ADDRESS_REJECTED);
  }

  /**
   * Registers the shipment with CDEK. Runs when the owner creates a fulfillment
   * in the panel, so a failure here is hers to see and retry: the error is
   * raised rather than swallowed, and nothing half-created is left behind
   * (CDEK either accepts the whole order or rejects it, `assertOrderAccepted`).
   *
   * The CDEK order number lands in the returned `data`, which Medusa stores on
   * the fulfillment. It is the ONLY place the number is kept, so the panel reads
   * it from there and the status webhook matches on it.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    items: Array<Record<string, unknown>>,
    order: Record<string, unknown> | undefined,
    fulfillment: Record<string, unknown>,
  ): Promise<CreateFulfillmentResult> {
    const methodData = data as unknown as CdekShippingMethodData;
    if (methodData?.provider !== "cdek" || !methodData.tenant_id) {
      // Not ours (a method created before this provider existed): behave like the
      // manual provider instead of failing the owner's click.
      return { data: {}, labels: [] };
    }

    const secret = await this.secret(methodData.tenant_id);
    const credentials = secret && cdekApiCredentials(secret);
    if (!secret || !credentials) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "СДЭК не настроен для этого магазина: заполните реквизиты в панели",
      );
    }

    const shippingAddress = (order?.shipping_address ?? {}) as Record<string, string | undefined>;
    const orderNumber = String(
      (order?.display_id as string | number | undefined) ?? fulfillment?.id ?? Date.now(),
    );

    // CDEK refuses an online-shop parcel without its goods, and checks the
    // parcel weight against them (t-2026-10-09-57, `cdek/package-items.ts`).
    const parcel = packageItems(items, order, methodData.default_weight_g);

    const toLocation: CdekLocation | undefined = methodData.cdek_point_code
      ? undefined
      : {
          city: shippingAddress.city ?? undefined,
          postal_code: shippingAddress.postal_code ?? undefined,
          country_code: (shippingAddress.country_code ?? "ru").toUpperCase(),
          address: [shippingAddress.address_1, shippingAddress.address_2]
            .filter(Boolean)
            .join(", "),
        };

    const ack = await createOrder(credentials, {
      number: orderNumber,
      tariff_code: methodData.tariff_code ?? (await this.fallbackTariffCode(methodData, secret)),
      delivery_point: methodData.cdek_point_code ?? undefined,
      to_location: toLocation,
      shipment_point: secret.credentials.shipment_point ?? undefined,
      from_location:
        secret.credentials.sender_mode === "door"
          ? {
              code: secret.credentials.sender_city_code ?? undefined,
              city: secret.credentials.sender_city_name ?? undefined,
              address: secret.credentials.sender_address ?? undefined,
            }
          : undefined,
      sender: {
        name: secret.credentials.sender_name ?? undefined,
        phones: secret.credentials.sender_phone
          ? [{ number: secret.credentials.sender_phone }]
          : undefined,
      },
      recipient: {
        name:
          [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ") ||
          "Получатель",
        phones: shippingAddress.phone ? [{ number: shippingAddress.phone }] : [],
        email: (order?.email as string | undefined) ?? undefined,
      },
      packages: [
        {
          number: `${orderNumber}-1`,
          weight: parcel.weight,
          comment: `Заказ ${orderNumber}`,
          items: parcel.items,
        },
      ],
    });

    const uuid = ack.entity?.uuid ?? null;
    this.logger_?.info(`[cdek] shipment registered for order ${orderNumber}: uuid=${uuid}`);

    return {
      data: { ...methodData, cdek_order_uuid: uuid, cdek_number: null },
      labels: [],
    };
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const methodData = data as unknown as CdekShippingMethodData;
    if (methodData?.provider !== "cdek" || !methodData.cdek_order_uuid || !methodData.tenant_id) {
      return {};
    }
    const secret = await this.secret(methodData.tenant_id);
    const credentials = secret && cdekApiCredentials(secret);
    if (!credentials) return {};
    await deleteOrder(credentials, methodData.cdek_order_uuid);
    this.logger_?.info(`[cdek] shipment ${methodData.cdek_order_uuid} cancelled`);
    return { ...methodData, cancelled_at: new Date().toISOString() };
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    // Returns go through CDEK's dashboard for now; nothing is registered here.
    return { data: {}, labels: [] };
  }

  /* ------------------------------------------------------------ internals */

  protected async secret(tenantId: string): Promise<ResolvedCdekSecret | null> {
    return readCdekSecret(this.pg_, tenantId);
  }

  /**
   * One tariff list for (shop, destination, weight), cached briefly. Returns
   * `null` when the shop is not configured, the address has no city, or CDEK has
   * no tariff of the needed mode for the route — every one of those means «no
   * price», and the caller turns that into a missing option rather than a zero.
   * The one exception is a point method with no tariff to a point: that throws
   * {@link CDEK_NO_POINTS}, because the buyer can act on it (choose the courier).
   */
  protected async quote(
    optionData: CdekMethodData,
    context: CalculateShippingOptionPriceContext,
  ): Promise<{ selected: NonNullable<ReturnType<typeof selectTariff>> } | null> {
    const secret = await this.secret(optionData.tenant_id);
    const credentials = secret && cdekApiCredentials(secret);
    if (!secret || !credentials) return null;

    const cart = context as unknown as {
      currency_code?: string;
      shipping_address?: {
        city?: string | null;
        postal_code?: string | null;
        country_code?: string | null;
      } | null;
      items?: Array<{
        quantity: number;
        unit_price: number;
        variant?: { weight?: number | null } | null;
        product?: { weight?: number | null } | null;
      }>;
    };

    const city = cart.shipping_address?.city?.trim();
    const postalCode = cart.shipping_address?.postal_code?.trim();
    if (!city && !postalCode) return null;

    const items: QuoteItem[] = (cart.items ?? []).map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      weight: item.variant?.weight ?? null,
      product_weight: item.product?.weight ?? null,
    }));
    const weight = cartWeightGrams(items, optionData.default_weight_g);
    const subtotal = cartSubtotal(items);

    const toLocation: CdekLocation = {
      city: city || undefined,
      postal_code: postalCode || undefined,
      country_code: (cart.shipping_address?.country_code ?? "ru").toUpperCase(),
    };
    const fromLocation: CdekLocation = secret.credentials.sender_city_code
      ? { code: secret.credentials.sender_city_code }
      : { city: secret.credentials.sender_city_name ?? undefined };
    if (!fromLocation.code && !fromLocation.city) return null;

    const cacheKey = JSON.stringify([
      optionData.tenant_id,
      secret.is_test,
      fromLocation,
      toLocation,
      weight,
    ]);
    const cached = this.quoteCache_.get(cacheKey);
    let tariffs = cached && Date.now() - cached.at < CART_CACHE_TTL_MS ? cached.tariffs : null;
    if (!tariffs) {
      tariffs = await listTariffs(credentials, {
        from_location: fromLocation,
        to_location: toLocation,
        packages: [{ weight }],
      });
      this.quoteCache_.set(cacheKey, { at: Date.now(), tariffs });
    }

    const selected = selectTariff(tariffs, {
      delivery_mode: deliveryModeFor(secret.credentials.sender_mode, optionData.kind),
      tariff_code: optionData.tariff_code,
      markup_amount: optionData.markup_amount,
      markup_percent: optionData.markup_percent,
      free_above_total: optionData.free_above_total,
      subtotal,
    });
    if (!selected && isPointKind(optionData.kind)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CDEK_NO_POINTS);
    }
    return selected ? { selected } : null;
  }

  /**
   * A tariff code for an order whose method never recorded one (a cart priced
   * before this field existed). Asks CDEK for the route the order actually has,
   * rather than guessing a constant that may not serve it.
   */
  protected async fallbackTariffCode(
    methodData: CdekShippingMethodData,
    secret: ResolvedCdekSecret,
  ): Promise<number> {
    const credentials = cdekApiCredentials(secret);
    if (!credentials) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "СДЭК не настроен для этого магазина");
    }
    const mode = deliveryModeFor(secret.credentials.sender_mode, methodData.kind);
    const cities = secret.credentials.sender_city_code
      ? []
      : await listCities(credentials, { city: secret.credentials.sender_city_name ?? "", size: 1 });
    const fromCode = secret.credentials.sender_city_code ?? cities[0]?.code;
    if (!fromCode) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "В настройках СДЭК не указан город отправления",
      );
    }
    const tariffs = await listTariffs(credentials, {
      from_location: { code: fromCode },
      to_location: { code: fromCode },
      packages: [{ weight: 1000 }],
    });
    const selected = selectTariff(tariffs, { delivery_mode: mode });
    if (!selected) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "СДЭК не вернул ни одного тарифа нужного режима",
      );
    }
    return selected.tariff.tariff_code;
  }
}

export default CdekFulfillmentService;
