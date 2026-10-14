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
  ApishipError,
  calculate,
  getPoint,
  listTariffs,
  type ApishipCalculatorAnswer,
  type ApishipCredentials as ApishipApiCredentials,
  type ApishipPoint,
} from "../../apiship/client";
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  getOrderStatus,
  type ApishipStatusAnswer,
} from "../../apiship/orders";
import {
  cartSubtotal,
  cartWeightGrams,
  deliveryTypeFor,
  isApishipMethodData,
  isApishipShippingMethodData,
  pickupTypeFor,
  requestedPointId,
  selectApishipTariff,
  termLabel,
  type ApishipMethodData,
  type ApishipShippingMethodData,
  type QuoteItem,
  type SelectedApishipTariff,
} from "../../apiship/method";
import { buildApishipOrderRequest } from "../../apiship/order-request";
import { apishipTrackingUrl, type ApishipStatusEntry } from "../../apiship/statuses";
import { carrierLabel } from "../../apiship/carriers";
import {
  apishipApiCredentials,
  readApishipSecret,
  type ResolvedApishipSecret,
} from "../../tenant-secrets/apiship";

type InjectedDependencies = {
  logger: Logger;
  [ContainerRegistrationKeys.PG_CONNECTION]: Knex;
};

const CART_CACHE_TTL_MS = 60_000;
/** How long the calculator may take per carrier before ApiShip drops it from the answer. */
const CALCULATOR_TIMEOUT_MS = 15_000;

/**
 * The store API's answer when ApiShip's calculator refuses the buyer's address.
 * The leading code is the contract with the storefront, which shows its own
 * translated sentence for it; the Russian rest is for anyone reading the raw answer.
 */
export const APISHIP_ADDRESS_REJECTED =
  "apiship_address_rejected: перевозчик не нашёл адрес — проверьте индекс и город";

/** The status entry kept in `data.apiship_statuses` from a status answer. */
export const statusEntryOf = (answer: ApishipStatusAnswer): ApishipStatusEntry => ({
  key: answer.status?.key ?? "unknown",
  at: answer.status?.created ?? new Date().toISOString(),
  name: answer.status?.name ?? null,
  provider_code: answer.status?.providerCode || null,
  provider_name: answer.status?.providerName || null,
  provider_description: answer.status?.providerDescription || null,
  error_code: answer.status?.errorCode || null,
});

/**
 * Fulfillment provider for ApiShip with per-tenant tokens (t-2026-10-14-58).
 *
 * One provider for every carrier the aggregator connects: the carrier is a
 * field of the option's `data` (`provider_key`), so СДЭК and Почта России are
 * two options of the same provider, priced by the same calculator call and
 * shipped by the same `POST /orders`. The direct СДЭК and Почта providers stay
 * untouched next to it; a shop switches ApiShip on in its own panel.
 *
 * Registered as provider `apiship`, so its id is `apiship_apiship`.
 */
class ApishipFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "apiship";

  protected readonly logger_: Logger;
  protected readonly pg_: Knex;
  /**
   * `calculatePrice` is called once per option per cart read, so a checkout
   * with two ApiShip methods asks the calculator twice within milliseconds. The
   * cache is keyed by everything that changes a price, lives for a minute, and
   * never crosses a tenant, because the tenant id is part of the key.
   */
  protected readonly quoteCache_ = new Map<string, { at: number; answer: ApishipCalculatorAnswer }>();

  constructor(container: InjectedDependencies) {
    super();
    this.logger_ = container.logger;
    this.pg_ = container[ContainerRegistrationKeys.PG_CONNECTION];
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: "apiship" }];
  }

  async validateOption(_data: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    return isApishipMethodData(data.data);
  }

  /**
   * Medusa stores whatever this returns on the cart's shipping method, and the
   * storefront sends only `apiship_point_id`. Everything else is filled in from
   * the option, the point directory and a fresh quote, so the order carries the
   * tariff it was priced with and the point as the carrier names it.
   *
   * A pickup method without a point, or with a point the carrier no longer
   * lists, is refused here with a sentence the buyer can act on: the
   * alternative is an order ApiShip cannot accept, discovered by the owner.
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!isApishipMethodData(optionData)) {
      return data;
    }
    const pointId = requestedPointId(data);
    if (optionData.kind === "pickup" && !pointId) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Выберите пункт выдачи");
    }

    const { credentials } = await this.credentials(optionData.tenant_id);
    let point: ApishipPoint | null = null;
    if (optionData.kind === "pickup" && pointId) {
      point = await getPoint(credentials, { providerKey: optionData.provider_key, id: pointId });
      if (!point || point.providerKey !== optionData.provider_key) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Этот пункт выдачи больше не принимает посылки: выберите другой",
        );
      }
    }

    let quoted: { selected: SelectedApishipTariff; weight: number } | null = null;
    try {
      quoted = await this.quote(optionData, context as CalculateShippingOptionPriceContext, point?.id ?? null);
    } catch (error) {
      // A quote is a nicety here, not the gate: the price the buyer accepted was
      // already produced by `calculatePrice`, and failing the whole
      // `setShippingMethod` because the aggregator blinked would lose the cart.
      this.logger_?.warn(`[apiship] validateFulfillmentData could not re-quote: ${(error as Error).message}`);
    }

    const result: ApishipShippingMethodData = {
      provider: "apiship",
      tenant_id: optionData.tenant_id,
      provider_key: optionData.provider_key,
      kind: optionData.kind,
      apiship_connection_id: optionData.connection_id ?? null,
      apiship_point_id: point?.id ?? null,
      apiship_point_code: point?.code ?? null,
      apiship_point_name: point?.name ?? null,
      apiship_point_address: point?.address ?? null,
      tariff_id: quoted?.selected.tariff.tariffId ?? optionData.tariff_id ?? null,
      tariff_name: quoted?.selected.tariff.tariffName ?? null,
      period_min: quoted?.selected.period_min ?? null,
      period_max: quoted?.selected.period_max ?? null,
      term_label: quoted ? termLabel(quoted.selected.period_min, quoted.selected.period_max) : null,
      carrier_amount: quoted?.selected.carrier_amount ?? null,
      weight_g: quoted?.weight ?? null,
      default_weight_g: optionData.default_weight_g ?? null,
    };
    return { ...data, ...result };
  }

  async calculatePrice(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    if (!isApishipMethodData(optionData)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Shipping option data is not an ApiShip method");
    }
    let quoted: { selected: SelectedApishipTariff; weight: number } | null;
    try {
      quoted = await this.quote(optionData, context, optionData.kind === "pickup" ? requestedPointId(data) : null);
    } catch (error) {
      throw this.calculatorRefusal(error);
    }
    if (!quoted) {
      // Medusa has no «this option does not serve this address» answer: a throw
      // here drops the option out of the list the storefront renders, which is
      // exactly right — better no card than a card priced at zero.
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${carrierLabel(optionData.provider_key)} не возит по этому адресу выбранным способом`,
      );
    }
    return {
      calculated_amount: quoted.selected.amount,
      is_calculated_price_tax_inclusive: false,
    };
  }

  /**
   * ApiShip refusing the request with a 4xx (an address it cannot parse) used
   * to be a 500 «An unknown error occurred» to the buyer. The log keeps
   * ApiShip's own code and texts; the store API answers 400 with
   * {@link APISHIP_ADDRESS_REJECTED} so the storefront can tell the buyer to
   * check the postcode and the city. Anything else goes on as it was.
   */
  protected calculatorRefusal(error: unknown): unknown {
    if (!(error instanceof ApishipError) || error.status === null || error.status < 400 || error.status >= 500) {
      return error;
    }
    this.logger_?.warn(`[apiship] calculator refused: ${error.detail.replace(/\d{5,}/g, "<цифры>")}`);
    return new MedusaError(MedusaError.Types.INVALID_DATA, APISHIP_ADDRESS_REJECTED);
  }

  /**
   * Registers the shipment with ApiShip. Runs when the owner creates a
   * fulfillment in the panel, so a failure here is hers to see and retry: the
   * error is raised rather than swallowed, and Medusa deletes the half-made
   * fulfillment itself (`createFulfillment` in the fulfillment module).
   *
   * The ApiShip order id lands in the returned `data`, which Medusa stores on
   * the fulfillment. It is the ONLY place the id is kept, so the documents
   * routes read it from there and the status sync matches on it. The carrier's
   * own number usually arrives seconds later (the upload is asynchronous,
   * measured 20 s on the test contour); one status read is tried at once so a
   * fast carrier's number lands on the first label.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    items: Array<Record<string, unknown>>,
    order: Record<string, unknown> | undefined,
    fulfillment: Record<string, unknown>,
    additionalData?: Record<string, unknown>,
  ): Promise<CreateFulfillmentResult> {
    const methodData = this.methodDataOf(data, additionalData);
    if (!methodData) {
      // Not ours (a method created before this provider existed): behave like the
      // manual provider instead of failing the owner's click.
      return { data: {}, labels: [] };
    }

    const { secret, credentials } = await this.credentials(methodData.tenant_id);
    const tariffId = methodData.tariff_id ?? (await this.fallbackTariffId(credentials, methodData, secret));

    let point: ApishipPoint | null = null;
    if (methodData.kind === "pickup" && methodData.apiship_point_id) {
      point = await getPoint(credentials, { providerKey: methodData.provider_key, id: methodData.apiship_point_id });
    }

    const displayId = String((order?.display_id as string | number | undefined) ?? "").trim();
    const clientNumber = displayId || String(fulfillment?.id ?? Date.now());
    const built = buildApishipOrderRequest({
      methodData,
      credentials: secret.credentials,
      tariffId,
      clientNumber,
      order,
      items,
      point: point
        ? { address: point.address, city: point.city, region: point.region, postIndex: point.postIndex }
        : null,
      connectionId: methodData.apiship_connection_id,
    });
    if ("missing" in built) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, this.missingSentence(built.missing));
    }

    let ack: { orderId: number; created: string | null };
    try {
      ack = await createOrder(credentials, built.request);
    } catch (error) {
      if (error instanceof ApishipError && error.status === 400 && /clientNumber|номер заказа/i.test(error.detail)) {
        // The same display id was registered before (a cancelled attempt that
        // ApiShip still counts): a suffix makes the number unique again.
        const retry = { ...built.request, order: { ...built.request.order, clientNumber: `${clientNumber}-${Date.now().toString(36).slice(-4)}` } };
        ack = await createOrder(credentials, retry);
        built.request.order.clientNumber = retry.order.clientNumber;
      } else {
        throw this.orderRefusal(error);
      }
    }

    let first: ApishipStatusAnswer | null = null;
    try {
      first = await getOrderStatus(credentials, ack.orderId);
    } catch (error) {
      this.logger_?.warn(`[apiship] first status read of order ${ack.orderId} failed: ${(error as Error).message}`);
    }
    const providerNumber = first?.orderInfo?.providerNumber?.trim() || null;
    const trackingUrl = apishipTrackingUrl(methodData.provider_key, providerNumber, first?.orderInfo?.trackingUrl);
    const entry = first ? statusEntryOf(first) : null;

    this.logger_?.info(
      `[apiship] shipment registered for order ${clientNumber}: apiship order ${ack.orderId}, carrier ${methodData.provider_key}, number ${providerNumber ?? "(pending)"}`,
    );

    return {
      data: {
        ...methodData,
        tariff_id: tariffId,
        weight_g: built.parcel.weight,
        apiship_order_id: ack.orderId,
        apiship_client_number: built.request.order.clientNumber,
        apiship_provider_number: providerNumber,
        apiship_tracking_url: providerNumber ? trackingUrl : null,
        apiship_status: entry?.key ?? null,
        apiship_status_at: entry?.at ?? null,
        apiship_status_name: entry?.name ?? null,
        apiship_status_detail: entry?.provider_description ?? null,
        apiship_statuses: entry ? [entry] : [],
      },
      labels: providerNumber
        ? [{ tracking_number: providerNumber, tracking_url: trackingUrl ?? "", label_url: "" }]
        : [],
    };
  }

  /**
   * Cancel in ApiShip (and in the carrier, where it supports that). ApiShip's
   * own `cancel` is tried first; when it refuses with a 4xx, `DELETE` marks the
   * order deleted in ApiShip (and in СДЭК). A refusal of both reaches the owner
   * as the error it is: a parcel already on its way cannot be cancelled here.
   */
  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const methodData = this.methodDataOf(data);
    if (!methodData?.apiship_order_id) {
      return { ...(data ?? {}) };
    }
    const { credentials } = await this.credentials(methodData.tenant_id);
    const orderId = Number(methodData.apiship_order_id);
    try {
      await cancelOrder(credentials, orderId);
    } catch (error) {
      if (!(error instanceof ApishipError) || error.status === null || error.status >= 500) {
        throw this.orderRefusal(error);
      }
      this.logger_?.warn(`[apiship] cancel of order ${orderId} refused (${error.message}); deleting instead`);
      try {
        await deleteOrder(credentials, orderId);
      } catch (deleteError) {
        throw this.orderRefusal(deleteError);
      }
    }
    this.logger_?.info(`[apiship] order ${orderId} cancelled`);
    return { ...methodData, apiship_cancelled_at: new Date().toISOString() };
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    // Returns go through the carrier's cabinet for now; nothing is registered here.
    return { data: {}, labels: [] };
  }

  /* ------------------------------------------------------------ internals */

  /**
   * The method data of this fulfillment: the cart's method, or the one a panel
   * route passed in `additional_data.apiship` for an order whose own method
   * is not an ApiShip one (the bridge from a direct СДЭК or Почта method).
   */
  protected methodDataOf(
    data: Record<string, unknown> | undefined,
    additionalData?: Record<string, unknown>,
  ): ApishipShippingMethodData | null {
    if (isApishipShippingMethodData(data)) return data;
    const bridged = additionalData?.apiship;
    if (isApishipShippingMethodData(bridged)) return bridged;
    return null;
  }

  protected async credentials(tenantId: string): Promise<{ secret: ResolvedApishipSecret; credentials: ApishipApiCredentials }> {
    const secret = await readApishipSecret(this.pg_, tenantId);
    const credentials = apishipApiCredentials(secret);
    if (!secret || !credentials) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "ApiShip не подключён в этом магазине: введите токен в настройках доставки",
      );
    }
    return { secret, credentials };
  }

  protected missingSentence(field: string): string {
    switch (field) {
      case "sender_name":
        return "В настройках ApiShip не указано контактное лицо отправителя";
      case "sender_phone":
        return "В настройках ApiShip не указан телефон отправителя";
      case "sender_address":
        return "В настройках ApiShip не указан адрес отправителя";
      case "recipient_phone":
        return "У заказа нет телефона получателя: перевозчик не примет отправку без него";
      case "recipient_address":
        return "У заказа нет адреса получателя";
      default:
        return `Не хватает данных для отправки: ${field}`;
    }
  }

  /** ApiShip's refusal of an order call, with its own texts, as a 400 the owner can read. */
  protected orderRefusal(error: unknown): unknown {
    if (error instanceof ApishipError && error.status !== null && error.status >= 400 && error.status < 500) {
      return new MedusaError(MedusaError.Types.INVALID_DATA, `ApiShip не принял отправку: ${error.detail}`);
    }
    return error;
  }

  /**
   * One calculator answer for (shop, route, weight, carrier, kind, point),
   * cached briefly. Returns `null` when the shop is not configured, the address
   * has no city, or the carrier returned no tariff for the route — every one of
   * those means «no price», and the caller turns that into a missing option
   * rather than a zero.
   */
  protected async quote(
    optionData: ApishipMethodData,
    context: CalculateShippingOptionPriceContext,
    pointId: number | null,
  ): Promise<{ selected: SelectedApishipTariff; weight: number } | null> {
    const secret = await readApishipSecret(this.pg_, optionData.tenant_id);
    const credentials = apishipApiCredentials(secret);
    if (!secret || !credentials) return null;

    const cart = context as unknown as {
      shipping_address?: {
        city?: string | null;
        postal_code?: string | null;
        country_code?: string | null;
        province?: string | null;
        address_1?: string | null;
      } | null;
      items?: Array<{
        quantity: number;
        unit_price: number;
        variant?: { weight?: number | null; product?: { weight?: number | null } | null } | null;
        product?: { weight?: number | null } | null;
      }>;
    };

    const city = cart.shipping_address?.city?.trim();
    const postalCode = cart.shipping_address?.postal_code?.trim();
    if (!city && !postalCode) return null;
    const sender = secret.credentials;
    if (!sender.sender_city && !sender.sender_index && !sender.sender_address) return null;

    const items: QuoteItem[] = (cart.items ?? []).map((item) => ({
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      weight: item.variant?.weight ?? null,
      product_weight: item.product?.weight ?? item.variant?.product?.weight ?? null,
    }));
    const weight = cartWeightGrams(items, optionData.default_weight_g);
    const subtotal = cartSubtotal(items);

    const request = {
      from: {
        countryCode: sender.sender_country_code || "RU",
        ...(sender.sender_city ? { city: sender.sender_city } : {}),
        ...(sender.sender_index ? { index: sender.sender_index } : {}),
        ...(sender.sender_address ? { addressString: sender.sender_address } : {}),
      },
      to: {
        countryCode: (cart.shipping_address?.country_code ?? "ru").toUpperCase(),
        ...(city ? { city } : {}),
        ...(postalCode ? { index: postalCode } : {}),
      },
      places: [
        {
          weight,
          length: sender.default_length_cm,
          width: sender.default_width_cm,
          height: sender.default_height_cm,
        },
      ],
      providerKeys: [optionData.provider_key],
      pickupTypes: [pickupTypeFor(sender.sender_mode)],
      deliveryTypes: [deliveryTypeFor(optionData.kind)],
      ...(pointId ? { pointOutId: pointId } : {}),
      assessedCost: Math.round(subtotal * 100) / 100,
      codCost: 0,
      includeFees: false,
      timeout: CALCULATOR_TIMEOUT_MS,
    };

    const cacheKey = JSON.stringify([optionData.tenant_id, request]);
    const cached = this.quoteCache_.get(cacheKey);
    let answer = cached && Date.now() - cached.at < CART_CACHE_TTL_MS ? cached.answer : null;
    if (!answer) {
      answer = await calculate(credentials, request);
      this.quoteCache_.set(cacheKey, { at: Date.now(), answer });
    }

    const selected = selectApishipTariff(
      optionData.kind === "courier" ? answer.deliveryToDoor : answer.deliveryToPoint,
      {
        provider_key: optionData.provider_key,
        tariff_id: optionData.tariff_id,
        markup_amount: optionData.markup_amount,
        markup_percent: optionData.markup_percent,
        free_above_total: optionData.free_above_total,
        subtotal,
      },
    );
    return selected ? { selected, weight } : null;
  }

  /**
   * A tariff for an order whose method never recorded one (the quote failed at
   * checkout time, or the method was bridged from a direct carrier method with
   * no pinned tariff). The carrier's tariff catalogue is asked for the first
   * tariff of the right pickup and delivery type, rather than guessing a
   * constant that may not serve it.
   */
  protected async fallbackTariffId(
    credentials: ApishipApiCredentials,
    methodData: ApishipShippingMethodData,
    secret: ResolvedApishipSecret,
  ): Promise<number> {
    const pickup = pickupTypeFor(secret.credentials.sender_mode);
    const delivery = deliveryTypeFor(methodData.kind);
    const tariffs = await listTariffs(credentials, { providerKey: methodData.provider_key });
    const fitting = tariffs.filter(
      (tariff) =>
        (tariff.pickupType === null || tariff.pickupType === pickup) &&
        (tariff.deliveryType === null || tariff.deliveryType === delivery),
    );
    // The carriers' everyday parcel tariff is the one named «Посылка» («Посылка
    // дверь-дверь» at СДЭК, «Посылка онлайн» at Почта); an express tariff that
    // happens to come first in the catalogue is refused on most routes
    // (measured: СДЭК answered «выбранный тариф недоступен» to «Супер-экспресс»).
    const fit = fitting.find((tariff) => /посылка/i.test(`${tariff.aliasName ?? ""} ${tariff.name}`)) ?? fitting[0];
    if (!fit) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `У ${carrierLabel(methodData.provider_key)} в ApiShip нет тарифа для этого способа доставки: укажите тариф в настройках`,
      );
    }
    return fit.id;
  }
}

export default ApishipFulfillmentService;
