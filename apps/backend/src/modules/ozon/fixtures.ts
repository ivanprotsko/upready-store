import { resolveEndpoint, type OzonReadEndpoint } from "./endpoints";

/**
 * Recorded Ozon answers (w11-ozon-readonly-client).
 *
 * WHY THIS FILE EXISTS. Ozon documents no sandbox: the word "песочница"
 * appears once on the whole Seller API reference and refers to the rich
 * content editor. So the only two ways to exercise this module are a live
 * cabinet key and recorded answers, and until Ivan hands over
 * `OZON_CLIENT_ID` / `OZON_API_KEY` there is no key.
 *
 * WHERE THE SHAPES COME FROM. Every object below is cut down from the example
 * response Ozon prints on its own reference page, saved at
 * `artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt`
 * (line numbers named per entry). Field names, nesting and value types are
 * Ozon's; only the business values are the client's own catalogue, so that a
 * fixture run of the shop "Фабрика натуральных продуктов" reads like the shop
 * and not like Ozon's "Тестовый товар 123". Nothing here is invented: a shape
 * that is not on that page is not in this file.
 *
 * WHAT A FIXTURE RUN IS AND IS NOT. It proves that the registry, the
 * transport's guards, the mirrors, the run log and the journal work end to
 * end. It proves NOTHING about Ozon's live behaviour. Every fixture run is
 * stamped `is_fixture = true` in `ozon_sync_run` and in `ozon_api_call`, so no
 * query over those tables can mistake one for traffic that left the machine.
 */

/** The shop the fixtures describe, so the sample reads like the real cabinet. */
const OFFER_A = "ognevka-ultra-60";
const OFFER_B = "shampun-zhenshen-250";
const PRODUCT_A = "1258417301";
const PRODUCT_B = "1258417455";
const SKU_A = "1934857210";
const SKU_B = "1934857433";

/** Saved page line 1473, `POST /v1/roles`. */
const ROLES = {
  expires_at: "2026-12-16T09:54:23.296Z",
  roles: [
    {
      name: "Read only",
      methods: [
        "/v1/roles",
        "/v1/seller/info",
        "/v3/product/list",
        "/v3/product/info/list",
        "/v4/product/info/attributes",
        "/v1/product/info/description",
        "/v5/product/info/prices",
        "/v4/product/info/stocks",
        "/v2/warehouse/list",
        "/v4/posting/fbs/list",
        "/v3/posting/fbo/list",
        "/v3/posting/fbs/get",
        "/v1/returns/list",
        "/v2/review/list",
        "/v2/review/count",
        "/v1/question/list",
        "/v1/analytics/data",
        "/v1/analytics/stocks",
        "/v1/rating/summary",
      ],
    },
  ],
};

/** Saved page line 1544, `POST /v1/seller/info`. */
const SELLER_INFO = {
  company: {
    country: "Россия",
    currency: "RUB",
    inn: "524900658999",
    legal_name: "Индивидуальный предприниматель Черкашина Оксана",
    name: "Фабрика натуральных продуктов",
    ogrn: "—",
    ownership_form: "Индивидуальный предприниматель",
    tax_system: "УСН",
  },
  ratings: [],
  subscription: { is_premium: false, type: "Базовый" },
};

/** Saved page line 3374, `POST /v3/product/list`. */
const PRODUCT_LIST = {
  result: {
    items: [
      {
        product_id: Number(PRODUCT_A),
        offer_id: OFFER_A,
        sku: Number(SKU_A),
        has_fbo_stocks: true,
        has_fbs_stocks: true,
        archived: false,
        is_discounted: false,
        quants: [],
      },
      {
        product_id: Number(PRODUCT_B),
        offer_id: OFFER_B,
        sku: Number(SKU_B),
        has_fbo_stocks: false,
        has_fbs_stocks: true,
        archived: false,
        is_discounted: false,
        quants: [],
      },
    ],
    total: 2,
    last_id: "",
  },
};

/** Saved page line 3821, `POST /v3/product/info/list`. */
const PRODUCT_INFO_LIST = {
  items: [
    {
      id: Number(PRODUCT_A),
      offer_id: OFFER_A,
      sku: Number(SKU_A),
      name: "Огнёвка Ультра, экстракт восковой моли, 60 капсул",
      barcodes: ["4620000000017"],
      currency_code: "RUB",
      description_category_id: 17028922,
      type_id: 970778161,
      images: [
        "https://cdn1.ozone.ru/s3/multimedia-1/ognevka-ultra-1.jpg",
        "https://cdn1.ozone.ru/s3/multimedia-1/ognevka-ultra-2.jpg",
      ],
      primary_image: ["https://cdn1.ozone.ru/s3/multimedia-1/ognevka-ultra-1.jpg"],
      is_archived: false,
      is_discounted: false,
      price: "1290.00",
      old_price: "1690.00",
      min_price: "1190.00",
      statuses: {
        is_created: true,
        moderate_status: "approved",
        status: "price_sent",
        status_name: "Продаётся",
        status_updated_at: "2026-09-10T08:12:44Z",
        validation_status: "valid",
      },
      stocks: {
        has_stock: true,
        stocks: [{ present: 42, reserved: 3, sku: Number(SKU_A), source: "fbs" }],
      },
      updated_at: "2026-09-14T11:02:13Z",
      vat: "0",
      visibility_details: { has_price: true, has_stock: true },
      volume_weight: 0.12,
    },
    {
      id: Number(PRODUCT_B),
      offer_id: OFFER_B,
      sku: Number(SKU_B),
      name: "Шампунь с экстрактом женьшеня, 250 мл",
      barcodes: ["4620000000024"],
      currency_code: "RUB",
      description_category_id: 17028766,
      type_id: 970778203,
      images: ["https://cdn1.ozone.ru/s3/multimedia-1/shampun-zhenshen-1.jpg"],
      primary_image: ["https://cdn1.ozone.ru/s3/multimedia-1/shampun-zhenshen-1.jpg"],
      is_archived: false,
      is_discounted: false,
      price: "540.00",
      old_price: "690.00",
      min_price: "490.00",
      statuses: {
        is_created: true,
        moderate_status: "approved",
        status: "price_sent",
        status_name: "Продаётся",
        status_updated_at: "2026-09-11T06:30:02Z",
        validation_status: "valid",
      },
      stocks: { has_stock: true, stocks: [{ present: 15, reserved: 0, sku: Number(SKU_B), source: "fbs" }] },
      updated_at: "2026-09-13T09:44:51Z",
      vat: "0",
      visibility_details: { has_price: true, has_stock: true },
      volume_weight: 0.3,
    },
  ],
};

/** Saved page line 4784, `POST /v1/product/info/description`. Answers for ONE card. */
const DESCRIPTIONS: Record<string, unknown> = {
  [PRODUCT_A]: {
    result: {
      id: Number(PRODUCT_A),
      offer_id: OFFER_A,
      name: "Огнёвка Ультра, экстракт восковой моли, 60 капсул",
      description:
        "Экстракт личинок большой восковой моли в капсулах. Состав: экстракт огнёвки, " +
        "вспомогательные вещества. Не является лекарственным средством.",
    },
  },
  [PRODUCT_B]: {
    result: {
      id: Number(PRODUCT_B),
      offer_id: OFFER_B,
      name: "Шампунь с экстрактом женьшеня, 250 мл",
      description: "Шампунь для укрепления волос с экстрактом корня женьшеня. Объём 250 мл.",
    },
  },
};

/** Saved page line 4318, `POST /v4/product/info/attributes`. */
const PRODUCT_ATTRIBUTES = {
  result: [
    {
      id: Number(PRODUCT_A),
      offer_id: OFFER_A,
      barcode: "4620000000017",
      barcodes: ["4620000000017"],
      description_category_id: 17028922,
      type_id: 970778161,
      attributes: [
        { attribute_id: 85, complex_id: 0, values: [{ dictionary_value_id: 0, value: "Фабрика натуральных продуктов" }] },
        { attribute_id: 9048, complex_id: 0, values: [{ dictionary_value_id: 0, value: "Огнёвка Ультра" }] },
      ],
      height: 100,
      width: 60,
      depth: 60,
      dimension_unit: "mm",
      weight: 120,
      weight_unit: "g",
    },
    {
      id: Number(PRODUCT_B),
      offer_id: OFFER_B,
      barcode: "4620000000024",
      barcodes: ["4620000000024"],
      description_category_id: 17028766,
      type_id: 970778203,
      attributes: [
        { attribute_id: 85, complex_id: 0, values: [{ dictionary_value_id: 0, value: "Фабрика натуральных продуктов" }] },
      ],
      height: 200,
      width: 60,
      depth: 60,
      dimension_unit: "mm",
      weight: 300,
      weight_unit: "g",
    },
  ],
};

/** Saved page line 7036, `POST /v5/product/info/prices`. */
const PRICES = {
  items: [
    {
      product_id: Number(PRODUCT_A),
      offer_id: OFFER_A,
      price: {
        price: 1290,
        old_price: 1690,
        min_price: 1190,
        net_price: 780,
        currency_code: "RUB",
        vat: 0,
        auto_action_enabled: true,
        auto_add_to_ozon_actions_list_enabled: true,
      },
      commissions: {
        sales_percent_fbo: 17,
        sales_percent_fbs: 15,
        fbo_deliv_to_customer_amount: 45,
        fbs_deliv_to_customer_amount: 60,
        fbo_return_flow_amount: 40,
        fbs_return_flow_amount: 35,
      },
      price_indexes: {
        color_index: "GREEN",
        ozon_index_data: { min_price: 1250, min_price_currency: "RUB", price_index_value: 0.97 },
      },
      marketing_actions: { ozon_actions_exist: false },
      acquiring: 1.5,
      volume_weight: 0.12,
    },
    {
      product_id: Number(PRODUCT_B),
      offer_id: OFFER_B,
      price: {
        price: 540,
        old_price: 690,
        min_price: 490,
        net_price: 310,
        currency_code: "RUB",
        vat: 0,
        auto_action_enabled: false,
        auto_add_to_ozon_actions_list_enabled: false,
      },
      commissions: {
        sales_percent_fbo: 19,
        sales_percent_fbs: 17,
        fbo_deliv_to_customer_amount: 45,
        fbs_deliv_to_customer_amount: 60,
        fbo_return_flow_amount: 40,
        fbs_return_flow_amount: 35,
      },
      price_indexes: {
        color_index: "YELLOW",
        ozon_index_data: { min_price: 520, min_price_currency: "RUB", price_index_value: 1.04 },
      },
      marketing_actions: { ozon_actions_exist: false },
      acquiring: 1.5,
      volume_weight: 0.3,
    },
  ],
  cursor: "",
  total: 2,
};

/** Saved page line 6234, `POST /v4/product/info/stocks`. */
const STOCKS = {
  items: [
    {
      offer_id: OFFER_A,
      product_id: Number(PRODUCT_A),
      stocks: [
        { sku: Number(SKU_A), type: "fbs", present: 42, reserved: 3, shipment_type: "SHIPMENT_TYPE_GENERAL" },
        { sku: Number(SKU_A), type: "fbo", present: 18, reserved: 1, shipment_type: "SHIPMENT_TYPE_GENERAL" },
      ],
    },
    {
      offer_id: OFFER_B,
      product_id: Number(PRODUCT_B),
      stocks: [
        { sku: Number(SKU_B), type: "fbs", present: 15, reserved: 0, shipment_type: "SHIPMENT_TYPE_GENERAL" },
      ],
    },
  ],
  cursor: "",
  total: 2,
};

/**
 * Saved page line 16045, `POST /v4/posting/fbs/list`.
 *
 * The answer is NOT wrapped in `result`: the method's own response schema is
 * `{ cursor, has_next, postings[] }`. A posting here carries `in_process_at`
 * and `shipment_date` but no `created_at` — that field exists only on the FBO
 * list — and `products[].price` is an object `{ amount, currency }`.
 */
const POSTINGS_FBS = {
  cursor: "",
  has_next: false,
  postings: [
    {
      posting_number: "8124095512-0031-1",
      order_id: 33301885134,
      order_number: "8124095512-0031",
      status: "awaiting_deliver",
      substatus: "posting_awaiting_deliver",
      products: [
        {
          imei: [],
          is_marketplace_buyout: false,
          name: "Огнёвка Ультра, экстракт восковой моли, 60 капсул",
          offer_id: OFFER_A,
          price: { amount: "1290.00", currency: "RUB" },
          quantity: 2,
          sku: Number(SKU_A),
          weight: 0.12,
        },
      ],
      analytics_data: {
        city: "Новосибирск",
        delivery_type: "PVZ",
        is_premium: false,
        is_legal: false,
        payment_type_group_name: "Банковская карта",
        region: "Новосибирская область",
        warehouse_id: 1020001835658000,
      },
      financial_data: {
        cluster_from: "Новосибирск",
        cluster_to: "Новосибирск",
        products: [
          {
            actions: [],
            commission: { amount: 387, currency: "RUB", percent: 15 },
            customer_price: { amount: "1290.00", currency: "RUB" },
            old_price: 1690,
            payout: 2193,
            price: 1290,
            product_id: Number(SKU_A),
            quantity: 2,
            total_discount_percent: 23.67,
            total_discount_value: 400,
          },
        ],
      },
      cancel_reason_id: 0,
      cancellation_initiator: "",
      in_process_at: "2026-09-14T06:22:01.884Z",
      shipment_date: "2026-09-15T10:00:00.000Z",
      tracking_number: "",
      tpl_integration_type: "ozon",
    },
  ],
};

/** Saved page line 20103, `POST /v3/posting/fbo/list`. */
const POSTINGS_FBO = {
  has_next: false,
  cursor: "",
  postings: [
    {
      posting_number: "9121072335-0187-1",
      order_id: 39127012901,
      order_number: "9121072335-0187",
      status: "delivered",
      substatus: "posting_received",
      cancellation: null,
      products: [
        {
          is_marketplace_buyout: false,
          offer_id: OFFER_B,
          name: "Шампунь с экстрактом женьшеня, 250 мл",
          sku: Number(SKU_B),
          quantity: 1,
          price: { amount: "540", currency: "RUB" },
          digital_codes: [],
        },
      ],
      analytics_data: {
        city: "",
        delivery_type: "PVZ",
        is_premium: false,
        payment_type_group_name: "Система Быстрых Платежей",
        warehouse_id: 1020001835658000,
        warehouse_name: "ОМСК_РФЦ",
        is_legal: false,
        client_delivery_date_begin: null,
        client_delivery_date_end: null,
      },
      financial_data: {
        products: [
          {
            payout: 437,
            product_id: Number(SKU_B),
            old_price: 690,
            price: 540,
            total_discount_value: 150,
            total_discount_percent: 21.7,
            actions: [],
            commission: { amount: 103, percent: 19, currency: "RUB" },
          },
        ],
        cluster_from: "Омск",
        cluster_to: "Новосибирск",
      },
      legal_info: null,
      external_order: { is_external: false, platform_name: "" },
      cancel_reason_id: 0,
      created_at: "2026-09-08T23:59:51.653736Z",
      in_process_at: "2026-09-09T00:00:07.716614Z",
      additional_data: [],
    },
  ],
};

/** Saved page line 39574, `POST /v2/review/list`. */
const REVIEWS = {
  reviews: [
    {
      id: "017c0d1c-66d3-b838-3d29-cf9b95a6ac48",
      sku: SKU_A,
      text: "Принимаю второй месяц, эффект есть. Упаковка пришла целой.",
      published_at: "2026-09-02T07:23:55.970Z",
      rating: 5,
      status: "NEW",
      comments_amount: 0,
      photos_amount: 1,
      videos_amount: 0,
      order_status: "DELIVERED",
      is_rating_participant: true,
    },
    {
      id: "017c0d53-a7c8-81ef-53de-7d32fcbd7421",
      sku: SKU_B,
      text: "Запах на любителя, но волосы стали мягче.",
      published_at: "2026-09-05T18:04:11.010Z",
      rating: 4,
      status: "PROCESSED",
      comments_amount: 1,
      photos_amount: 0,
      videos_amount: 0,
      order_status: "DELIVERED",
      is_rating_participant: true,
    },
  ],
  has_next: false,
  last_id: "",
};

/** Saved page line 39070, `POST /v2/review/count`. */
const REVIEW_COUNT = { total: 2, processed: 1, new: 1, viewed: 0 };

/** Saved page line 40344, `POST /v1/question/list`. */
const QUESTIONS = {
  has_next: false,
  questions: [
    {
      answers_count: 0,
      author_name: "Пользователь OZON",
      id: "019294ff-6888-7009-89d8-26569e4e450d",
      sku: Number(SKU_A),
      product_url: `https://www.ozon.ru/product/${SKU_A}/`,
      published_at: "2026-09-07T12:02:01.889Z",
      question_link: `https://www.ozon.ru/product/${SKU_A}/questions/?qid=290180206`,
      text: "Сколько капсул в день принимать?",
      status: "NEW",
    },
  ],
  last_id: "",
};

/** Saved page line 11123, `POST /v2/warehouse/list`. */
const WAREHOUSES = {
  cursor: "",
  has_next: "false",
  warehouses: [
    {
      warehouse_id: 20605650762000,
      name: "Склад Черкашино",
      status: "created",
      is_rfbs: false,
      is_kgt: false,
      working_days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    },
  ],
};

/** Saved page line 31441, `POST /v1/returns/list`. */
const RETURNS = { returns: [], has_next: false };

/** Saved page line 55593, `POST /v1/analytics/data`. */
const ANALYTICS_DATA = {
  result: { data: [], totals: [0] },
  timestamp: "2026-09-16 06:00:00",
};

/** Saved page line 35728, `POST /v1/analytics/stocks`. */
const ANALYTICS_STOCKS = { items: [] };

/** Saved page line 37736, `POST /v1/rating/summary`. */
const RATING_SUMMARY = { groups: [] };

/**
 * One recorded answer per registered endpoint id. `product.info.description`
 * answers per card, so it is a function of the request body; the rest ignore
 * it, because their fixture holds the whole (small) page in one answer.
 */
const ANSWERS: Record<string, (body: unknown) => unknown> = {
  "access.roles": () => ROLES,
  "seller.info": () => SELLER_INFO,
  "product.list": () => PRODUCT_LIST,
  "product.info.list": () => PRODUCT_INFO_LIST,
  "product.info.attributes": () => PRODUCT_ATTRIBUTES,
  "product.info.description": (body) => {
    const productId = String((body as { product_id?: unknown } | null)?.product_id ?? "");
    const found = DESCRIPTIONS[productId];
    if (!found) {
      throw new OzonFixtureMissingError(
        `Нет записанного ответа /v1/product/info/description для product_id ${productId || "(пусто)"}.`,
      );
    }
    return found;
  },
  "product.prices": () => PRICES,
  "product.stocks": () => STOCKS,
  "warehouse.list": () => WAREHOUSES,
  "posting.fbs.list": () => POSTINGS_FBS,
  "posting.fbs.get": () => ({ result: POSTINGS_FBS.postings[0] }),
  "posting.fbo.list": () => POSTINGS_FBO,
  "returns.list": () => RETURNS,
  "review.list": () => REVIEWS,
  "review.count": () => REVIEW_COUNT,
  "question.list": () => QUESTIONS,
  "analytics.data": () => ANALYTICS_DATA,
  "analytics.stocks": () => ANALYTICS_STOCKS,
  "rating.summary": () => RATING_SUMMARY,
};

/** A fixture asked for and not recorded. Loud on purpose: a silent `{}` here
 * would make an empty mirror look like an empty cabinet (rule 20a). */
export class OzonFixtureMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OzonFixtureMissingError";
  }
}

export const fixtureEndpointIds = (): string[] => Object.keys(ANSWERS).sort();

/**
 * The recorded answer for one registered endpoint. Goes through
 * `resolveEndpoint` first, so an unregistered id is refused in fixture mode
 * exactly as it is on the network: the guard is not something the fixtures
 * switch off.
 */
export const fixtureFor = <T = unknown>(endpointId: string, body: unknown): T => {
  const entry: OzonReadEndpoint = resolveEndpoint(endpointId);
  const answer = ANSWERS[entry.id];
  if (!answer) {
    throw new OzonFixtureMissingError(
      `Эндпоинт ${entry.id} зарегистрирован, но записанного ответа для него нет ` +
        "(src/modules/ozon/fixtures.ts).",
    );
  }
  return answer(body) as T;
};
