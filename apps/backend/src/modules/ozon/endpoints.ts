/**
 * The registry of Ozon Seller API endpoints this repository is allowed to call
 * (w11-ozon-readonly-client).
 *
 * Ivan's order, 2026-09-16 02:46 WITA: marketplace APIs are READ-ONLY for us.
 * Data moves one way, Ozon -> our local database, and no code path here may
 * ever send a mutating request to Ozon. That is enforced by this file and by
 * `transport.ts`, never by trusting the key's access level.
 *
 * WHY AN ALLOW-LIST IS THE ONLY SHAPE THAT WORKS HERE.
 *
 * On Ozon the HTTP verb tells you nothing. Of the 467 methods parsed out of
 * the saved reference, 461 are POST and 6 are GET
 * (`artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`). The
 * same verb on the same host does all of this:
 *
 *   POST /v3/product/list            "Метод для получения списка всех товаров."   read
 *   POST /v3/product/import          "Создать или обновить товар"                 write
 *   POST /v2/products/stocks         "Обновить количество товаров на складах"     write
 *   POST /v1/review/comment/create   "Оставить комментарий на отзыв"              write, PUBLIC
 *
 * So an allow-list of exact (method, path) pairs the documentation itself
 * calls a read is the only safe rule, and because effectively every entry is a
 * POST, `readViaPost` is REQUIRED on every entry: the doc anchor plus the
 * method's own sentence, copied verbatim, so a reviewer can check the claim
 * without opening the portal.
 *
 * Every claim below was read on the saved page
 * `artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt`
 * (the WHOLE Seller API reference, 1 441 722 characters, saved 2026-09-15T20:50Z
 * through a headed Chrome over CDP, because docs.ozon.ru answers curl with a
 * `?__rr=1…5` redirect loop and then 403). Nothing here comes from memory
 * (rule 17a).
 */

/** The one host Ozon serves the Seller API from. Saved page, line 225: "Рабочая среда: api-seller.ozon.ru". */
export const OZON_HOST = "api-seller.ozon.ru";

/** The reference page. Anchors are the openapi renderer's own operation anchors. */
const DOC = "https://docs.ozon.ru/api/seller/";

/**
 * A read Ozon defines as a POST with a request body. `reason` is the doc's own
 * sentence about the method, copied verbatim (Russian, because a translation
 * would no longer be a quotation).
 */
export type OzonReadViaPost = {
  docUrl: string;
  reason: string;
};

export type OzonReadEndpoint = {
  /** What a caller names. Stable: the sync and the journal use it. */
  id: string;
  /** Host without a scheme. Must be exactly `api-seller.ozon.ru`. */
  host: string;
  /** GET, or POST for a documented query-with-a-body. Never a write verb. */
  method: "GET" | "POST";
  /** Path with `:name` placeholders, filled from `params`. */
  path: string;
  /** The doc page and anchor this entry was read from. */
  docUrl: string;
  /** The method's title in the Ozon documentation, verbatim. */
  summary: string;
  /** Required on EVERY POST entry, which here means on every entry. */
  readViaPost?: OzonReadViaPost;
  /**
   * Overrides `OZON_TIMEOUT_MS` for this endpoint. Only where the docs or a
   * measurement demand it: the value is a fact, not a preference.
   */
  timeoutMs?: number;
  /**
   * The documented minimum interval between two calls of THIS method, where
   * Ozon states one. `/v1/analytics/data`: "Метод можно использовать не больше
   * 1 раза в минуту."
   */
  minIntervalMs?: number;
};

/**
 * MUTATIONS, BY PATH. Each line was checked against the saved page on
 * 2026-09-16 and carries Ozon's own title for the method, so the list is
 * evidence and not a memory (the brief's own draft named `/v1/product/import`,
 * which does not exist on the page at all: the real one is `/v3/product/import`
 * — that is exactly the "deny-list built from memory" bug one level up).
 *
 * Nothing routes THROUGH this list: `OZON_READ_ENDPOINTS` is default-deny and
 * a path absent from it cannot be called whatever this list says. The list is
 * a tripwire on the AUTHOR: a registry entry whose path stands here fails
 * module load, loudly, at boot.
 *
 * It is also the input to `readOnly` in `credentials.ts`: a key whose
 * `roles[].methods` cover one of these paths is NOT read-only.
 */
export const OZON_WRITE_PATHS: Readonly<Record<string, string>> = {
  "/v3/product/import": "Создать или обновить товар",
  "/v1/product/import/prices": "Обновить цену",
  "/v1/product/import-by-sku": "Создать товар по SKU",
  "/v2/products/stocks": "Обновить количество товаров на складах",
  "/v1/product/digital/stocks/import": "Обновить количество цифровых товаров",
  "/v2/product/pictures/import": "Загрузить или обновить изображения товара",
  "/v1/product/pictures/import": "Загрузить или обновить изображения товара Deprecated",
  "/v1/product/archive": "Перенести товар в архив",
  "/v1/product/unarchive": "Вернуть товар из архива",
  "/v2/products/delete": "Удалить товар без SKU из архива",
  "/v1/product/attributes/update": "Обновить характеристики товара",
  "/v1/review/comment/create": "Оставить комментарий на отзыв",
  "/v2/review/comment/delete": "Удалить комментарий на отзыв",
  "/v1/review/change-status": "Изменить статус отзывов Deprecated",
  "/v2/review/change-status": "Изменить статус отзывов",
  "/v1/question/answer/create": "Создать ответ на вопрос",
  "/v1/question/answer/delete": "Удалить ответ на вопрос",
  "/v1/question/change-status": "Изменить статус вопросов",
  "/v1/chat/send/message": "Отправить сообщение",
  "/v1/chat/send/file": "Отправить файл",
  "/v1/chat/start": "Создать новый чат",
  "/v2/chat/read": "Отметить сообщения как прочитанные",
  "/v1/returns/settings/utilization/update": "Обновить настройки автоутилизации",
  "/v1/returns/rfbs/action/set": "Передать доступные действия для rFBS возвратов",
  // Everything under /v*/posting/fbs/ the docs describe as an ACTION on the
  // order, verified one by one in the saved index on 2026-09-16.
  "/v1/posting/fbs/split": "Разделить заказ на отправления без сборки",
  "/v1/posting/fbs/traceable/split": "Разделить отправление с прослеживаемыми товарами",
  "/v1/posting/fbs/timeslot/set": "Перенести дату доставки",
  "/v1/posting/fbs/package-label/create": "Создать задание на выгрузку этикеток",
  "/v1/posting/fbs/pick-up-code/verify": "Проверить код курьера",
  "/v2/posting/fbs/act/create": "Подтвердить отгрузку и создать документы",
  "/v2/posting/fbs/arbitration": "Открыть спор по отправлению",
  "/v2/posting/fbs/awaiting-delivery": "Передать отправление к отгрузке",
  "/v2/posting/fbs/cancel": "Отменить отправление",
  "/v2/posting/fbs/product/cancel": "Отменить отправку некоторых товаров в отправлении",
  "/v2/posting/fbs/product/country/set": "Добавить информацию о стране-изготовителе товара",
  "/v2/posting/fbs/package-label/create": "Создать задание на формирование этикеток",
  "/v4/posting/fbs/ship": "Собрать заказ (версия 4)",
  "/v4/posting/fbs/ship/package": "Частичная сборка отправления (версия 4)",
};

/**
 * THE BLUNT SECOND TRIPWIRE: path segments that name a mutation.
 *
 * Measured over all 467 documented methods on 2026-09-16: this set matches
 * 176 of them, and 29 of those 176 are READS whose path merely contains an
 * action word (`/v1/fbp/archive/list` — "Получить список завершённых поставок",
 * `/v1/warehouse/fbs/create/drop-off/list` — "Получить список drop-off пунктов
 * для создания склада", `/v1/order/cancel/status` — "Получить статус отмены
 * заказа"). So the rule is deliberately BLUNT and its false positives are
 * real.
 *
 * That is acceptable HERE and nowhere else, because the only thing it can do
 * is refuse to let an author register a path at module load, with the segment
 * named in the message. A future read caught by it is added to
 * `OZON_SEGMENT_EXCEPTIONS` with its doc title, which is a 30-second fix with
 * a citation attached.
 *
 * It is NOT used to decide `readOnly` for a key: telling a shop owner their
 * key can write because its path contains the word "create" would be a value
 * substituted for a measurement (rule 20a). `credentials.ts` uses
 * `OZON_WRITE_PATHS` alone.
 */
export const OZON_MUTATION_SEGMENTS: ReadonlySet<string> = new Set([
  "create",
  "update",
  "delete",
  "set",
  "import",
  "import-by-sku",
  "archive",
  "unarchive",
  "cancel",
  "ship",
  "send",
  "split",
  "start",
  "activate",
  "deactivate",
  "change-status",
  "confirm",
  "approve",
  "decline",
  "reject",
  "verify",
  "upload",
  "remove",
  "add",
  "move",
  "apply",
  "submit",
]);

/**
 * Paths the segment tripwire catches that the documentation calls reads. Empty
 * today: none of the 19 registered endpoints contains a mutation segment.
 * Adding one means quoting the method's own title from the saved page.
 */
export const OZON_SEGMENT_EXCEPTIONS: Readonly<Record<string, string>> = {};

/**
 * Everything this repository may ask Ozon for. Adding an entry is a deliberate
 * act: the POST ids additionally have to be added BY HAND to
 * `POST_READ_ENDPOINT_IDS` in `__tests__/transport.unit.spec.ts`, and the
 * suite stays red until someone does. On Ozon that double bookkeeping covers
 * the WHOLE registry rather than a handful of exceptions, because effectively
 * every Ozon method is a POST.
 */
export const OZON_READ_ENDPOINTS: readonly OzonReadEndpoint[] = [
  {
    id: "access.roles",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/roles",
    docUrl: `${DOC}#operation/AccessAPI_RolesByToken`,
    summary: "Получить список ролей и методов по API-ключу",
    readViaPost: {
      docUrl: `${DOC}#operation/AccessAPI_RolesByToken`,
      reason:
        "Описание метода: «Метод для получения информации и ролях и методах, привязанных к API-ключу.» " +
        "Ответ: { expires_at, roles: [{ name, methods: [...] }] } — документированный способ спросить " +
        "у ключа его собственную область. Ничего не изменяет.",
    },
  },
  {
    id: "seller.info",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/seller/info",
    docUrl: `${DOC}#operation/SellerAPI_SellerInfo`,
    summary: "Информация о кабинете продавца",
    readViaPost: {
      docUrl: `${DOC}#operation/SellerAPI_SellerInfo`,
      reason:
        "Раздел «Информация по кабинету продавца», заголовок метода «Информация о кабинете продавца». " +
        "Тело запроса пустое, в ответе company / ratings / subscription — идентичность кабинета.",
    },
  },
  {
    id: "product.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v3/product/list",
    docUrl: `${DOC}#operation/ProductAPI_GetProductList`,
    summary: "Список товаров",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductList`,
      reason:
        "Описание метода: «Метод для получения списка всех товаров.» Курсор (last_id, limit) и фильтр " +
        "видимости едут в теле, поэтому Ozon описывает это чтение как POST.",
    },
  },
  {
    id: "product.info.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v3/product/info/list",
    docUrl: `${DOC}#operation/ProductAPI_GetProductInfoListV3`,
    summary: "Получить информацию о товарах по идентификаторам",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductInfoListV3`,
      reason:
        "Описание метода: «Метод для получения информации о товарах по их идентификаторам. В теле " +
        "запроса должен быть массив однотипных идентификаторов, в ответе будет массив items.»",
    },
  },
  {
    id: "product.info.attributes",
    host: OZON_HOST,
    method: "POST",
    path: "/v4/product/info/attributes",
    docUrl: `${DOC}#operation/ProductAPI_GetProductAttributesV4`,
    summary: "Получить описание характеристик товара",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductAttributesV4`,
      reason:
        "Описание метода: «Возвращает описание характеристик товаров по идентификатору и видимости. " +
        "Товар можно искать по offer_id, product_id или sku.» Обновление характеристик — это другой " +
        "метод, /v1/product/attributes/update, и он стоит в OZON_WRITE_PATHS.",
    },
  },
  {
    id: "product.info.description",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/product/info/description",
    docUrl: `${DOC}#operation/ProductAPI_GetProductInfoDescription`,
    summary: "Получить описание товара",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductInfoDescription`,
      reason:
        "Заголовок метода: «Получить описание товара». В ответе result: { id, offer_id, name, " +
        "description }. Тело запроса — идентификатор товара.",
    },
  },
  {
    id: "product.prices",
    host: OZON_HOST,
    method: "POST",
    path: "/v5/product/info/prices",
    docUrl: `${DOC}#operation/ProductAPI_GetProductInfoPricesV5`,
    summary: "Получить информацию о цене товара",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductInfoPricesV5`,
      reason:
        "Заголовок метода: «Получить информацию о цене товара»; описание: «Вы можете посмотреть " +
        "историю обновления цен только в личном кабинете продавца.» Обновление цены — другой метод, " +
        "/v1/product/import/prices, он в OZON_WRITE_PATHS.",
    },
  },
  {
    id: "product.stocks",
    host: OZON_HOST,
    method: "POST",
    path: "/v4/product/info/stocks",
    docUrl: `${DOC}#operation/ProductAPI_GetProductInfoStocksV4`,
    summary: "Информация о количестве товаров",
    readViaPost: {
      docUrl: `${DOC}#operation/ProductAPI_GetProductInfoStocksV4`,
      reason:
        "Описание метода: «Возвращает информацию о количестве товаров по схемам FBO, FBS, rFBS и FBP: " +
        "сколько единиц есть в наличии, сколько зарезервировано покупателями.» Перезапись остатков — " +
        "/v2/products/stocks, она в OZON_WRITE_PATHS.",
    },
  },
  {
    id: "warehouse.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v2/warehouse/list",
    docUrl: `${DOC}#operation/WarehouseAPI_WarehouseListV2`,
    summary: "Список складов",
    readViaPost: {
      docUrl: `${DOC}#operation/WarehouseAPI_WarehouseListV2`,
      reason:
        "Описание метода: «Метод возвращает список складов FBS и rFBS. Чтобы получить список складов " +
        "FBO, используйте метод /v1/warehouse/fbo/list.» Версия /v1/warehouse/list НЕ регистрируется: " +
        "её страница говорит: «Метод устаревает и будет отключён 7 апреля 2026 года.»",
    },
  },
  {
    id: "posting.fbs.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v4/posting/fbs/list",
    docUrl: `${DOC}#operation/PostingAPI_GetFbsPostingListV4`,
    summary: "Получить список отправлений",
    readViaPost: {
      docUrl: `${DOC}#operation/PostingAPI_GetFbsPostingListV4`,
      reason:
        "Описание метода: «Возвращает список отправлений за указанный период времени — он должен быть " +
        "не больше одного года.» Версия v3 не регистрируется: «С 31 августа 2026 года метод будет " +
        "отключён. Переключитесь на /v4/posting/fbs/list.»",
    },
  },
  {
    id: "posting.fbs.get",
    host: OZON_HOST,
    method: "POST",
    path: "/v3/posting/fbs/get",
    docUrl: `${DOC}#operation/PostingAPI_GetFbsPostingV3`,
    summary: "Получить информацию об отправлении по идентификатору",
    readViaPost: {
      docUrl: `${DOC}#operation/PostingAPI_GetFbsPostingV3`,
      reason:
        "Заголовок метода: «Получить информацию об отправлении по идентификатору». Тело запроса — " +
        "posting_number; в ответе result с составом отправления. Ничего не изменяет.",
    },
  },
  {
    id: "posting.fbo.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v3/posting/fbo/list",
    docUrl: `${DOC}#operation/PostingAPI_GetFboPostingListV3`,
    summary: "Получить список отправлений",
    readViaPost: {
      docUrl: `${DOC}#operation/PostingAPI_GetFboPostingListV3`,
      reason:
        "Описание метода: «Возвращает список отправлений за указанный период времени. Если период " +
        "больше года, вернётся ошибка PERIOD_IS_TOO_LONG.» Версия v2 не регистрируется: «С 31 августа " +
        "2026 года метод будет отключён. Переключитесь на /v3/posting/fbo/list.»",
    },
  },
  {
    id: "returns.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/returns/list",
    docUrl: `${DOC}#operation/ReturnAPI_GetReturnsList`,
    summary: "Информация о возвратах FBO и FBS",
    readViaPost: {
      docUrl: `${DOC}#operation/ReturnAPI_GetReturnsList`,
      reason:
        "Описание метода: «Метод для получения информации о возвратах FBO и FBS.» Фильтр и limit едут " +
        "в теле. Действия по возвратам — /v1/returns/rfbs/action/set, она в OZON_WRITE_PATHS.",
    },
  },
  {
    id: "review.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v2/review/list",
    docUrl: `${DOC}#operation/ReviewAPI_GetReviewList`,
    summary: "Получить список отзывов",
    readViaPost: {
      docUrl: `${DOC}#operation/ReviewAPI_GetReviewList`,
      reason:
        "Заголовок метода: «Получить список отзывов»; описание: «Доступно для продавцов с подпиской " +
        "Управление отзывами или Premium Pro.» Комментирование отзыва — /v1/review/comment/create, " +
        "она в OZON_WRITE_PATHS: этот клиент не может ответить покупателю от имени магазина.",
    },
  },
  {
    id: "review.count",
    host: OZON_HOST,
    method: "POST",
    path: "/v2/review/count",
    docUrl: `${DOC}#operation/ReviewAPI_GetReviewCount`,
    summary: "Получить количество отзывов по статусам",
    readViaPost: {
      docUrl: `${DOC}#operation/ReviewAPI_GetReviewCount`,
      reason:
        "Заголовок метода: «Получить количество отзывов по статусам»; описание: «Доступно для " +
        "продавцов с подпиской Управление отзывами или Premium Pro.» Ответ — счётчики total / " +
        "processed / new / viewed.",
    },
  },
  {
    id: "question.list",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/question/list",
    docUrl: `${DOC}#operation/QuestionAPI_GetQuestionList`,
    summary: "Список вопросов",
    readViaPost: {
      docUrl: `${DOC}#operation/QuestionAPI_GetQuestionList`,
      reason:
        "Заголовок метода: «Список вопросов»; описание: «Доступно для продавцов с подпиской Premium " +
        "Plus.» Ответ на вопрос — /v1/question/answer/create, она в OZON_WRITE_PATHS.",
    },
  },
  {
    id: "analytics.data",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/analytics/data",
    docUrl: `${DOC}#operation/AnalyticsAPI_AnalyticsGetData`,
    summary: "Данные аналитики",
    readViaPost: {
      docUrl: `${DOC}#operation/AnalyticsAPI_AnalyticsGetData`,
      reason:
        "Описание метода: «Укажите период и метрики, которые нужно посчитать. В ответе будет " +
        "аналитика, сгруппированная по параметру dimensions.» Там же: «Метод можно использовать не " +
        "больше 1 раза в минуту.»",
    },
    // The doc's own sentence, not a guess: "Метод можно использовать не больше
    // 1 раза в минуту." Enforced in transport.ts, per Client-Id and per method.
    minIntervalMs: 60_000,
  },
  {
    id: "analytics.stocks",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/analytics/stocks",
    docUrl: `${DOC}#operation/AnalyticsAPI_AnalyticsStocksV1`,
    summary: "Получить аналитику по остаткам",
    readViaPost: {
      docUrl: `${DOC}#operation/AnalyticsAPI_AnalyticsStocksV1`,
      reason:
        "Описание метода: «Используйте метод, чтобы получить аналитику по остаткам товаров на складах " +
        "в реальном времени. Метод соответствует разделу FBO → Управление остатками в личном кабинете.»",
    },
  },
  {
    id: "rating.summary",
    host: OZON_HOST,
    method: "POST",
    path: "/v1/rating/summary",
    docUrl: `${DOC}#operation/RatingAPI_RatingSummaryV1`,
    summary: "Получить информацию о текущих рейтингах продавца",
    readViaPost: {
      docUrl: `${DOC}#operation/RatingAPI_RatingSummaryV1`,
      reason:
        "Описание метода: «Рейтинг продавца по следующим показателям: индекс цен, доставки вовремя, " +
        "процент отмен, жалобы и другие. Соответствует разделу Рейтинги → Рейтинги продавца в личном " +
        "кабинете.» Тело запроса — пустой объект.",
    },
  },
];

/**
 * Thrown before any socket is opened. Carries what was asked for so the log
 * line names the offender, never the key.
 */
export class OzonWriteForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OzonWriteForbiddenError";
  }
}

/** The verbs that may appear in the registry at all. */
const READ_METHODS = new Set(["GET", "POST"]);

/** The mutation segment a path carries, or `null`. Placeholders never count. */
export const mutationSegmentOf = (path: string): string | null => {
  if (OZON_SEGMENT_EXCEPTIONS[path]) {
    return null;
  }
  for (const segment of path.split("/")) {
    if (segment && !segment.startsWith(":") && OZON_MUTATION_SEGMENTS.has(segment)) {
      return segment;
    }
  }
  return null;
};

/**
 * Checks the whole registry. Called at module load (bottom of this file), so a
 * bad entry fails the process at boot rather than at the first sync, and
 * called again by the guard suite with hand-built entries.
 */
export const validateRegistry = (
  entries: readonly OzonReadEndpoint[] = OZON_READ_ENDPOINTS,
): void => {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.id) {
      throw new OzonWriteForbiddenError("An Ozon endpoint entry has no id.");
    }
    if (seen.has(entry.id)) {
      throw new OzonWriteForbiddenError(`Duplicate Ozon endpoint id ${entry.id}.`);
    }
    seen.add(entry.id);

    if (!READ_METHODS.has(entry.method)) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} declares method ${entry.method}. Only GET and documented read ` +
          "POSTs can be registered: this client never writes to Ozon.",
      );
    }

    if (entry.method === "POST" && !entry.readViaPost?.docUrl) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} is a POST without readViaPost.docUrl. On Ozon the verb decides ` +
          "nothing (461 of 467 documented methods are POST), so a POST is only registrable when the " +
          "documentation defines it as a query with a body; cite the page.",
      );
    }

    if (entry.method === "POST" && (entry.readViaPost?.reason?.length ?? 0) < 20) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} cites a doc URL but no reason. Copy the method's own sentence.`,
      );
    }

    if (entry.method === "GET" && entry.readViaPost) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} is a GET carrying readViaPost. That field marks a POST read only.`,
      );
    }

    if (entry.host !== OZON_HOST) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} names host ${entry.host}. The Seller API lives at ${OZON_HOST} ` +
          "and nowhere else.",
      );
    }

    if (!entry.path.startsWith("/")) {
      throw new OzonWriteForbiddenError(`Ozon endpoint ${entry.id} has a path that is not absolute.`);
    }

    if (OZON_WRITE_PATHS[entry.path]) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} registers ${entry.path}, which the documentation calls ` +
          `"${OZON_WRITE_PATHS[entry.path]}" — a mutation. It can never be registered here.`,
      );
    }

    const segment = mutationSegmentOf(entry.path);
    if (segment) {
      throw new OzonWriteForbiddenError(
        `Ozon endpoint ${entry.id} registers ${entry.path}, whose segment "${segment}" names a ` +
          "mutation. If the documentation calls this method a read, add the path to " +
          "OZON_SEGMENT_EXCEPTIONS with the method's own title quoted from the saved page.",
      );
    }

    if (!entry.docUrl) {
      throw new OzonWriteForbiddenError(`Ozon endpoint ${entry.id} cites no documentation page.`);
    }
  }
};

/** Every registered POST, the list the guard suite checks by hand. */
export const postReadEndpointIds = (
  entries: readonly OzonReadEndpoint[] = OZON_READ_ENDPOINTS,
): string[] =>
  entries
    .filter((entry) => entry.method === "POST")
    .map((entry) => entry.id)
    .sort();

/**
 * The entry a caller named. A miss is an `OzonWriteForbiddenError` and not a
 * "not found": an unregistered call is exactly the thing this module exists to
 * refuse, whatever the caller believed it was doing.
 */
export const resolveEndpoint = (endpointId: string): OzonReadEndpoint => {
  const entry = OZON_READ_ENDPOINTS.find((candidate) => candidate.id === endpointId);
  if (!entry) {
    throw new OzonWriteForbiddenError(
      `Ozon endpoint ${endpointId} is not registered. Only reads listed in ` +
        "src/modules/ozon/endpoints.ts may leave this process.",
    );
  }
  return entry;
};

validateRegistry();
