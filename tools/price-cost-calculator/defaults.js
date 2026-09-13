/**
 * Входы модели по умолчанию и ПАСПОРТ каждой цифры: откуда она, когда получена,
 * замер это или допущение. Задача t-2026-09-14-02.
 *
 * Правило 17a: цифра без источника в формулу не едет. Поэтому у каждого числа
 * есть запись в SOURCES; поля `kind`:
 *   "measured"  — замер (наш собственный или открытый API, команда воспроизводима);
 *   "published" — опубликованный прайс/закон/исследование с датой обращения;
 *   "assumed"   — НАШЕ допущение: данных нет, значение выбрано и обосновано;
 *   "planned"   — плановый сценарий (парк магазинов), не замер: у нас 0 магазинов.
 *
 * Значение null = «данных нет». Модель не подставляет вместо него правдоподобное
 * число, а выносит строку в warnings (правило 20a).
 */

export const FETCHED = "2026-09-14";

/** Паспорт цифр: ключ → {kind, value, unit, source, fetched, note}. */
export const SOURCES = {
  "traffic.pagesPerVisit": {
    kind: "published",
    unit: "страниц/визит",
    source: "Littledata, «Average website performance», бенчмарк 2 800 e-commerce-сайтов, 2023 — https://www.littledata.io/average-website-performance",
    fetched: FETCHED,
    note: "2,6 по e-commerce в целом; 2,8 по Shopify. Contentsquare Digital Experience Benchmark 2026 даёт 4,1 — методики разные, взято меньшее (консервативно для трафика, оптимистично для затрат).",
  },
  "traffic.dynamicRequestsPerPage": {
    kind: "assumed",
    unit: "SSR-запросов/страницу",
    source: "наше допущение",
    note: "1 SSR-рендер на страницу. Заменяется замером на стенде (MEASURE.md §1).",
  },
  "traffic.apiRequestsPerPage": {
    kind: "assumed",
    unit: "API-запросов/страницу",
    source: "наше допущение",
    note: "Витрина Next.js тянет каталог/корзину/регион через Store API. Заменяется замером (MEASURE.md §1).",
  },
  "traffic.mediaMbPerVisit": {
    kind: "assumed",
    unit: "МБ/визит",
    source: "наше допущение",
    note: "Картинки товаров за визит. Заменяется замером веса страницы на стенде (MEASURE.md §2).",
  },
  "traffic.peakHourFactor": {
    kind: "measured",
    unit: "×, пиковый час к среднему часу",
    source: "Wikimedia REST API, ru.wikipedia, agent=user, почасовые просмотры 2026-09-01..2026-09-08 (169 часов): пик суточного профиля / среднечасовое = 1,50; максимум отдельного часа = 1,64; доля пикового часа в сутках 6,25 % против 4,17 % при равномерном распределении",
    fetched: FETCHED,
    note: "Прокси: аудитория энциклопедии ровнее аудитории одного магазина. Нижняя граница, не верхняя. Команда воспроизведения — MEASURE.md §3.",
  },
  "traffic.peakDayFactor": {
    kind: "assumed",
    unit: "×, пиковый день к среднему дню",
    source: "наше допущение",
    note: "Промо, рассылка, сезон. Открытой цифры по РФ-магазинам нашего размера мы не нашли; 2,0 — рабочее значение, чувствительность считается.",
  },
  "traffic.burstQuantileZ": {
    kind: "measured",
    unit: "квантиль нормальной аппроксимации",
    source: "3,09 = 99,9-й процентиль стандартного нормального распределения (свойство распределения, не замер рынка)",
    note: "Приходы запросов пуассоновские: σ = √λ. Ёмкость берётся на λ + z√λ.",
  },
  "traffic.peakHoursPerMonth": {
    kind: "assumed",
    unit: "часов/мес",
    source: "наше допущение",
    note: "Сколько часов в месяце нужна доплаченная ёмкость: 3 часа в сутки × 30 суток. Заменяется данными автоскейла, когда он появится.",
  },

  "capacity.cpuMsPerDynamicRequest": {
    kind: "assumed",
    unit: "мс CPU/запрос",
    source: "наше допущение — ГЛАВНЫЙ неизмеренный вход",
    note: "SSR-рендер страницы витрины. Замера у нас нет: стенда с нагрузочным профилем не поднимали. MEASURE.md §1 — как заменить.",
  },
  "capacity.cpuMsPerApiRequest": {
    kind: "assumed",
    unit: "мс CPU/запрос",
    source: "наше допущение",
    note: "Запрос к Store API Medusa с попаданием в кэш.",
  },
  "capacity.targetUtilisation": {
    kind: "assumed",
    unit: "доля 0..1",
    source: "наше допущение",
    note: "Целевая загрузка ядра. Выше 0,7 очередь растёт быстрее линейного.",
  },
  "capacity.vcpuPriceRubPerMonth": {
    kind: "published",
    unit: "₽/vCPU/мес",
    source: "Timeweb Cloud, тариф Cloud-80: 1 800 ₽/мес за 4 vCPU × 3,3 ГГц / 8 ГБ / 80 ГБ NVMe — https://timeweb.cloud/services/cloud-servers",
    fetched: FETCHED,
    note: "1800/4 = 450 ₽ за vCPU-месяц. Цена на странице — с учётом скидки 10 % при оплате за 12 месяцев; тарификация почасовая. Трафик на VDS страница объявляет бесплатным и безлимитным. РФ-площадка выбрана не по цене, а по 152-ФЗ: персональные данные покупателей магазинов должны храниться в РФ.",
  },

  "storage.dbKbPerProduct": {
    kind: "measured",
    unit: "КБ/товар",
    source: "наш замер сид-каталога репозитория: apps/backend/src/migration-scripts/data/products/json/products.json — 14 680 байт на 11 товаров = 1 334 байта/товар",
    fetched: FETCHED,
    note: "Это размер ИСХОДНОЙ записи каталога, а не строк в Postgres. Реальный объём с вариантами, ценами, переводами и индексами больше — множитель dbOverheadFactor, он допущение.",
  },
  "storage.dbOverheadFactor": {
    kind: "assumed",
    unit: "×",
    source: "наше допущение",
    note: "Во сколько раз объём в БД с индексами и переводами больше исходного JSON. Заменяется замером pg_total_relation_size на стенде (MEASURE.md §4).",
  },
  "storage.mediaMbPerProduct": {
    kind: "assumed",
    unit: "МБ/товар",
    source: "наше допущение",
    note: "4 изображения × 300 КБ после оптимизации. Заменяется замером бакета стенда (MEASURE.md §4).",
  },
  "storage.storagePriceRubPerGbMonth": {
    kind: "published",
    unit: "₽/ГБ/мес",
    source: "Timeweb Cloud S3: 1 ГБ — 1 ₽/мес, 10 ГБ — 79 ₽/мес, 100 ГБ — 349 ₽/мес, безлимитный — 639 ₽/мес (250 ГБ включено, свыше 2 ₽/ГБ) — https://timeweb.cloud/services/s3-storage",
    fetched: FETCHED,
    note: "Взята линейная ставка 1 ₽/ГБ; на объёмах от 10 ГБ фактическая ниже (7,9 ₽ за 10 ГБ → 0,79 ₽/ГБ). Консервативно в большую сторону.",
  },
  "storage.egressPriceRubPerGb": {
    kind: "published",
    unit: "₽/ГБ",
    source: "Timeweb Cloud S3: бесплатный лимит исходящего трафика 100 ГБ/мес на аккаунт, сверх лимита 1,3 ₽/ГБ — https://timeweb.cloud/services/s3-storage",
    fetched: FETCHED,
    note: "Бесплатные 100 ГБ — на аккаунт, а не на магазин; на предельном товаре не учитываются (в пользу дороговизны).",
  },
  "storage.mediaFromServerDisk": {
    kind: "assumed",
    unit: "переключатель",
    source: "архитектурная развилка",
    note: "Если медиа раздаются с диска VDS, исходящий трафик входит в тариф сервера (бесплатный и безлимитный по странице Timeweb) и egress обнуляется. Если из S3 — платим 1,3 ₽/ГБ сверх лимита.",
  },

  "business.paymentCommissionPct": {
    kind: "published",
    unit: "% выручки",
    source: "Tribute, wiki.tribute.tg: «Прозрачная комиссия без сложных процентов — 10 % за всё»; FAQ: «10 % с каждой успешной транзакции, включая комиссию сервиса и платёжных провайдеров»; выплаты дважды в месяц, минимум 3 000 ₽ — https://wiki.tribute.tg/llms-full.txt",
    fetched: FETCHED,
    note: "Канал оплаты v1 по решению Ивана 2026-09-12. Выплата приходит на карту, отдельной комиссии за обналичивание в этом канале нет.",
  },
  "business.bankCashoutPct": {
    kind: "published",
    unit: "% суммы вывода",
    source: "Т-Банк, тарифы для бизнеса: переводы физлицам на тарифе «Простой» 1,5 % + 99 ₽ до 400 000 ₽/мес; на свои карты в Т-Банке — бесплатно — https://www.tbank.ru/business/tariffs/",
    fetched: FETCHED,
    note: "Ноль по умолчанию: в канале Tribute вывод уже внутри 10 %. Ставится ≠ 0, если деньги идут через расчётный счёт ИП и выводятся на карту стороннего банка.",
  },
  "business.usnPct": {
    kind: "published",
    unit: "% доходов",
    source: "УСН с объектом «доходы», ставка 6 % — ст. 346.20 НК РФ",
    fetched: FETCHED,
    note: "Региональных пониженных ставок не учитываем — регистрация не выбрана.",
  },
  "business.fixedContributionsRubPerYear": {
    kind: "published",
    unit: "₽/год",
    source: "Фиксированные страховые взносы ИП за себя на 2026 год — 57 390 ₽ (п. 1.2 ст. 430 НК РФ); плюс 1 % с дохода свыше 300 000 ₽, потолок этой части 321 818 ₽ — https://glavkniga.ru/situations/k518795",
    fetched: FETCHED,
    note: "У ИП без работников на УСН «доходы» налог уменьшается на взносы вплоть до нуля — переключатель usnReduceTaxByContributions. 1 % свыше 300 000 ₽ модель пока НЕ считает: он зависит от годового дохода, а не от цены товара; для парка из плана это ≈ (выручка − 300 тыс.) × 1 %, добавить строкой при годовом бюджете.",
  },
  "business.vatAuto": {
    kind: "published",
    unit: "переключатель",
    source: "ФЗ-425 от 28.11.2025: с 01.01.2026 порог освобождения от НДС для УСН снижен с 60 до 20 млн ₽ дохода за год (ст. 145 НК РФ); ставки 5 % (20–250 млн ₽), 7 % (250–450 млн ₽), общая 22 % — https://www.kontur-extern.ru/info/53637-nds_na_usn",
    fetched: FETCHED,
    note: "Модель сама выбирает ставку по годовой выручке парка. При плановых 200 магазинах × 4 499 ₽ × 12 = 10,8 млн ₽ — освобождение; порог перейдён примерно на 371 магазине.",
  },
  "business.marginPct": {
    kind: "assumed",
    unit: "% к себестоимости",
    source: "решение бизнеса, не источник",
    note: "Значение по умолчанию — предложение, а не измеренная величина.",
  },

  "segments.*": {
    kind: "assumed",
    unit: "визитов/мес на 1 товар",
    source: "калибровка сверху вниз, не замер",
    note: [
      "Границы сегментов взяты по распределению размера каталога: StoreInspect, 824 860 живых Shopify-магазинов, 2026-06-29 — до 25 товаров 32,0 %, 25–99 25,0 %, 100–499 23,4 %, 500–999 6,7 %, 1000+ 11,2 %.",
      "Коэффициент «визитов на товар» открытые источники не публикуют НИ ОДИН. Значения подобраны так, чтобы посещаемость типичного магазина сегмента попадала в опубликованные диапазоны: StoreCensus (18.02.2026) — типичный Shopify-магазин меньше 10 000 визитов/мес, средние по нишам 2 000–2 900 визитов/мес; StoreInspect (1 348 405 магазинов, обновлено 2026-09-13) — 76,1 % магазинов в полосе «меньше 50 тыс. визитов/мес». Медианы ни один источник не даёт.",
      "Падение коэффициента с ростом каталога опирается на Ahrefs: 96,55 % страниц в индексе не получают трафика из Google (исследование ~14 млрд страниц) — длинный хвост карточек не приносит визитов.",
      "Замечание о качестве источника: у StoreCensus полосы посещаемости внутренне противоречивы (43,8 % «до 50 тыс.» и одновременно 44,8 % «200 тыс.–1 млн»), поэтому он использован только как порядок величины.",
      "ЭТО ГЛАВНЫЙ ВХОД, КОТОРЫЙ ЗАМЕНИТ ЗАМЕР: посещаемость наших собственных магазинов в разрезе размера каталога (MEASURE.md §5).",
    ].join(" "),
  },

  "fleet.*": {
    kind: "planned",
    unit: "штук",
    source: "плановый сценарий, у нас НОЛЬ платящих магазинов на 2026-09-14",
    note: "Парк — сценарий, а не факт. Любая строка, которая делится на число магазинов (доля фикса, нагрузка бесплатных), меняется вместе с ним; см. чувствительность.",
  },
};

/** @type {import('./model.js').Inputs} */
export const DEFAULT_INPUTS = {
  segments: [
    {
      key: "showcase",
      name: "Витрина",
      basis: "до 25 товаров — 32,0 % магазинов (StoreInspect, 824 860 магазинов, 2026-06-29)",
      productsTypical: 15,
      baseVisitsPerMonth: 400,
      visitsPerProductPerMonth: 8,
      storeShare: 0.32,
    },
    {
      key: "niche",
      name: "Нишевый бренд",
      basis: "25–99 товаров — 25,0 % магазинов",
      productsTypical: 60,
      baseVisitsPerMonth: 600,
      visitsPerProductPerMonth: 6,
      storeShare: 0.25,
    },
    {
      key: "catalog",
      name: "Каталожный магазин",
      basis: "100–499 товаров — 23,4 % магазинов",
      productsTypical: 300,
      baseVisitsPerMonth: 800,
      visitsPerProductPerMonth: 4,
      storeShare: 0.234,
    },
    {
      key: "large",
      name: "Крупный каталог",
      basis: "500–999 товаров — 6,7 % магазинов; это первый сегмент, который упирается в лимит 500",
      productsTypical: 750,
      baseVisitsPerMonth: 1000,
      visitsPerProductPerMonth: 2,
      storeShare: 0.067,
    },
    {
      key: "feed",
      name: "Прайс поставщика",
      basis: "1 000+ товаров — 11,2 % магазинов; каталог загружен выгрузкой, хвост карточек без трафика",
      productsTypical: 5000,
      baseVisitsPerMonth: 1200,
      visitsPerProductPerMonth: 0.6,
      storeShare: 0.112,
    },
  ],

  traffic: {
    pagesPerVisit: 2.6,
    dynamicRequestsPerPage: 1,
    apiRequestsPerPage: 2,
    mediaMbPerVisit: 1.5,
    peakHourFactor: 1.5,
    peakDayFactor: 2,
    burstQuantileZ: 3.09,
    peakHoursPerMonth: 90,
  },

  capacity: {
    cpuMsPerDynamicRequest: 120,
    cpuMsPerApiRequest: 25,
    targetUtilisation: 0.65,
    vcpuPriceRubPerMonth: 450,
    poolingMode: "shared",
  },

  storage: {
    dbKbPerProduct: 1.3,
    dbOverheadFactor: 8,
    mediaMbPerProduct: 1.2,
    storagePriceRubPerGbMonth: 1,
    egressPriceRubPerGb: 1.3,
    egressFreeGbPerMonth: 100,
    mediaFromServerDisk: false,
  },

  fixed: {
    allocation: "perProduct",
    allocationShare: 1,
    items: [
      { name: "Сервер приложения, Timeweb Cloud-100 (8 vCPU / 12 ГБ)", value: 2790, source: "timeweb.cloud/services/cloud-servers, 2026-09-14" },
      { name: "Сервер базы данных, Timeweb Cloud-80 (4 vCPU / 8 ГБ)", value: 1800, source: "timeweb.cloud/services/cloud-servers, 2026-09-14" },
      { name: "Объектное хранилище S3, 100 ГБ", value: 349, source: "timeweb.cloud/services/s3-storage, 2026-09-14" },
      { name: "Резервные копии (второй провайдер)", value: null, source: "счёта не читали — данных нет" },
      { name: "Домены и сертификаты", value: null, source: "счёта не читали — данных нет" },
      { name: "Мониторинг и алерты", value: null, source: "счёта не читали — данных нет" },
      { name: "Почта и уведомления покупателям", value: null, source: "провайдер не выбран — данных нет" },
    ],
  },

  fleet: {
    payingStores: 200,
    freePlan: {
      enabled: true,
      freeStoresPerPayingStore: 4,
      productsPerFreeStore: 15,
      segmentKey: "showcase",
    },
  },

  business: {
    paymentCommissionPct: 10,
    bankCashoutPct: 0,
    usnPct: 6,
    fixedContributionsRubPerYear: 57390,
    usnReduceTaxByContributions: true,
    vatAuto: true,
    vatPct: 0,
    vatInsidePrice: true,
    marginPct: 30,
    marginFixedRubPerProduct: 0,
    avgRevenuePerStoreRubPerMonth: 4499,
  },

  pricing: {
    segmentKey: "large",
    catalogueSizeForPricing: 750,
    includedProducts: 500,
    marginalStepProducts: 100,
    roundToRub: 0.05,
    ladder: [
      { label: "501–2 000 товаров", at: 1000, segmentKey: "large" },
      { label: "2 001–10 000 товаров", at: 5000, segmentKey: "feed" },
      { label: "10 001–100 000 товаров", at: 30000, segmentKey: "feed" },
    ],
  },
};

/** Рыночные якоря: чужие опубликованные цены за товар в месяц (для сверки, не для формулы). */
export const MARKET_ANCHORS = {
  source:
    "inSales, Приказ № Т-10 от 17.04.2026 «Об утверждении Тарифных планов» (скан, OCR), https://www.insales.ru — тарифы: Сайт-визитка 1 580 ₽; Интернет-магазин 2 700 ₽ / 1 000 товаров; Селлер 4 800 ₽ / 1 000; Комбо 6 600 ₽ / 1 000; Сайт из маркетплейса 6 600 ₽ / 1 000; Интернет-магазин ПРО 9 800 ₽ / 10 000; Комбо ПРО 14 800 ₽ / 10 000; Ультра 29 900 ₽ / 300 000",
  fetched: FETCHED,
  steps: [
    { from: 1000, to: 10000, fromRub: 2700, toRub: 9800, label: "inSales: Интернет-магазин → ПРО" },
    { from: 10000, to: 300000, fromRub: 9800, toRub: 29900, label: "inSales: ПРО → Ультра" },
  ],
};

/** Предельная цена товара, зашитая в чужую сетку: ΔЦена / ΔЛимит. */
export function marketMarginalRubPerProduct(step) {
  return (step.toRub - step.fromRub) / (step.to - step.from);
}
