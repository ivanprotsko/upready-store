import {
  CSV_COLUMNS,
  DEFAULT_PERIOD_DAYS,
  byDateDesc,
  facetsOf,
  inPeriod,
  matchesFilters,
  mpOrderToRow,
  resolveFilters,
  resolvePeriod,
  shopOrderToRow,
  toAmount,
  toCsv,
  type FeedRow,
} from "../order-feed";
import { connectionNotice } from "../order-feed";
import { ORDER_STATUS_LABELS, statusKeyOf } from "../order-status";
import { canonicalScheme } from "../scheme";

/**
 * The pure half of the single order feed (w15-mp-orders-desk).
 *
 * Everything here is a function of its arguments — the clock included, which
 * is why `resolvePeriod` takes `now` instead of reading it — so these run
 * without a stand, without a database and without a marketplace.
 */

const NOW = new Date("2026-09-16T09:00:00.000Z");

const mpRow = (over: Partial<Parameters<typeof mpOrderToRow>[0]> = {}) =>
  mpOrderToRow(
    {
      id: "mporder_1",
      marketplace: "wb",
      external_id: "123456789",
      scheme: "FBS",
      status: "complete",
      status_detail: "sold",
      ordered_at: new Date("2026-09-10T10:00:00.000Z"),
      buyer_region: null,
      warehouse_name: "507",
      total: 1290,
      currency: "RUB",
      is_cancelled: false,
      ...over,
    } as never,
    1,
  );

describe("период по умолчанию", () => {
  it("без дат — последние 30 дней, и ответ помечен как умолчание", () => {
    const period = resolvePeriod({}, NOW);

    expect(period.is_default).toBe(true);
    expect(period.days).toBe(DEFAULT_PERIOD_DAYS);
    expect(period.to.toISOString()).toBe("2026-09-16T23:59:59.999Z");
    expect(period.from.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    /*
     * Экран печатает ДНИ, а не моменты: 23:59:59.999Z верхней границы в поясе
     * магазина (WITA, UTC+8) — это уже следующее утро, и подпись «последние 30
     * дней» читалась как «по 17 сентября» при периоде по 16-е (замер на стенде).
     */
    expect(period.from_day).toBe("2026-08-18");
    expect(period.to_day).toBe("2026-09-16");
  });

  it("названный период не считается умолчанием и считается включительно", () => {
    const period = resolvePeriod({ from: "2026-09-01", to: "2026-09-30" }, NOW);

    expect(period.is_default).toBe(false);
    expect(period.days).toBe(30);
  });

  it("половина периода — законный запрос: только «с» достраивается концом", () => {
    const period = resolvePeriod({ from: "2026-09-14" }, NOW);

    expect(period.is_default).toBe(false);
    expect(period.from.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-09-16T23:59:59.999Z");
  });

  it("мусор вместо даты — это отсутствие даты, а не 1970 год", () => {
    expect(resolvePeriod({ from: "позавчера" }, NOW).from.toISOString()).toBe(
      "2026-08-18T00:00:00.000Z",
    );
  });
});

describe("заказ без даты", () => {
  it("не попадает ни в один период — вместо того чтобы попасть во все", () => {
    expect(inPeriod(null, new Date("2000-01-01"), NOW)).toBe(false);
    expect(inPeriod("не дата", new Date("2000-01-01"), NOW)).toBe(false);
  });

  it("в сортировке уходит вниз, а не наверх", () => {
    const dated = mpRow();
    const undated = mpRow({ id: "mporder_2", ordered_at: null });

    expect([undated, dated].sort(byDateDesc)[0].id).toBe("mporder_1");
  });
});

describe("статус площадки -> общий ключ", () => {
  it("WB: терминальный wbStatus перевешивает статус продавца", () => {
    /* WB: «sold — the order is sold», при supplierStatus «complete — In delivery». */
    expect(statusKeyOf("wb", "complete", "sold")).toBe("delivered");
    /* «defect — cancellation of the order due to a defect» — это отмена. */
    expect(statusKeyOf("wb", "complete", "defect")).toBe("cancelled");
    expect(statusKeyOf("wb", "complete", "canceled_by_client")).toBe("cancelled");
  });

  it("WB: без терминального — решает статус продавца", () => {
    expect(statusKeyOf("wb", "new", "waiting")).toBe("new");
    expect(statusKeyOf("wb", "confirm", "waiting")).toBe("processing");
    /* «ready_for_pickup — came at pickup point and waiting for the client» — ещё не получен. */
    expect(statusKeyOf("wb", "complete", "ready_for_pickup")).toBe("shipped");
  });

  it("Ozon: свои слова, свой ключ", () => {
    expect(statusKeyOf("ozon", "awaiting_deliver", null)).toBe("processing");
    expect(statusKeyOf("ozon", "delivered", null)).toBe("delivered");
    expect(statusKeyOf("ozon", "client_arbitration", null)).toBe("returned");
  });

  it("неизвестное слово — «другой статус», а не «новый»", () => {
    expect(statusKeyOf("wb", "чего-то новенькое", null)).toBe("other");
    expect(ORDER_STATUS_LABELS.other).toBe("Другой статус площадки");
  });

  it("площадка не прислала статуса вовсе — это третий ответ, а не «другой»", () => {
    /*
     * Так устроен статистический метод WB: поля статуса у него нет, отмена —
     * отдельный флаг. Замер на данных магазина: 1623 таких заказа за 30 дней.
     * «Нет статуса» и «статус, которого мы не знаем» — разные факты, и лечатся
     * они по-разному (правило 20a).
     */
    expect(statusKeyOf("wb", null, null)).toBe("unspecified");
    expect(statusKeyOf("ozon", null, null)).toBe("unspecified");
    expect(ORDER_STATUS_LABELS.unspecified).toBe("Статус площадка не присылает");
  });
});

describe("схема", () => {
  it("приводится к одному написанию в ядре, а не в каждом адаптере", () => {
    expect(canonicalScheme("fbs")).toBe("FBS");
    expect(canonicalScheme("FBO")).toBe("FBO");
    expect(canonicalScheme("rfbs")).toBe("rFBS");
  });

  it("незнакомое слово площадки остаётся её словом", () => {
    expect(canonicalScheme("wbgo")).toBe("WBGO");
    expect(canonicalScheme(null)).toBeNull();
    expect(canonicalScheme("")).toBeNull();
  });
});

describe("фильтры", () => {
  const rows: FeedRow[] = [
    mpRow(),
    mpRow({ id: "mporder_2", marketplace: "ozon", scheme: "FBO", status: "delivered" } as never),
    shopOrderToRow({
      id: "order_1",
      display_id: 12,
      status: "pending",
      created_at: "2026-09-12T08:00:00.000Z",
      currency_code: "rub",
      total: 500,
      items: [{ id: "item_1" }],
    }),
  ];

  it("неизвестное значение в ссылке отбрасывается, а не обнуляет таблицу", () => {
    const filters = resolveFilters({ source: "wb,telegram", status: "delivered,нет" }, NOW);

    expect(filters.sources).toEqual(["wb"]);
    expect(filters.statuses).toEqual(["delivered"]);
  });

  it("площадка, схема и статус сужают ленту", () => {
    const wbOnly = resolveFilters({ source: "wb" }, NOW);
    expect(rows.filter((row) => matchesFilters(row, wbOnly))).toHaveLength(1);

    const fbo = resolveFilters({ scheme: "fbo" }, NOW);
    expect(rows.filter((row) => matchesFilters(row, fbo)).map((row) => row.id)).toEqual([
      "mporder_2",
    ]);
  });

  it("заказ магазина не имеет схемы и поэтому не проходит фильтр по схеме", () => {
    const fbs = resolveFilters({ scheme: "FBS" }, NOW);
    const shop = rows.find((row) => row.source === "shop") as FeedRow;

    expect(shop.scheme).toBeNull();
    expect(matchesFilters(shop, fbs)).toBe(false);
  });

  it("счётчики фильтров считаются по периоду, а не по уже отфильтрованному", () => {
    const facets = facetsOf(rows);

    expect(facets.sources.map((one) => one.value)).toEqual(["shop", "wb", "ozon"]);
    expect(facets.sources.every((one) => one.count === 1)).toBe(true);
    expect(facets.schemes.map((one) => one.value)).toEqual(["FBO", "FBS"]);
  });
});

describe("деньги", () => {
  it("bigNumber приходит строкой, числом и объектом — и читается одинаково", () => {
    expect(toAmount("1290.5")).toBe(1290.5);
    expect(toAmount(1290)).toBe(1290);
    expect(toAmount({ value: "1290" })).toBe(1290);
  });

  it("нечитаемая сумма остаётся пустой, а не нулём", () => {
    expect(toAmount(null)).toBeNull();
    expect(toAmount("")).toBeNull();
    expect(toAmount("бесплатно")).toBeNull();
  });
});

describe("CSV", () => {
  const rows = [mpRow(), mpRow({ id: "mporder_2", external_id: "987" } as never)];

  it("строк в файле ровно столько же, сколько в ленте, плюс заголовок", () => {
    const csv = toCsv(rows);
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(rows.length + 1);
    /* Заголовок идёт после BOM — его и проверяем, BOM отдельным тестом ниже. */
    expect(lines[0]).toBe(`\ufeff${CSV_COLUMNS.join(",")}`);
  });

  it("пустая лента даёт файл с одним заголовком, а не пустой файл", () => {
    expect(toCsv([]).trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("запятая и кавычка внутри значения не ломают колонки", () => {
    const csv = toCsv([mpRow({ warehouse_name: 'Склад "Коледино", корпус 2' } as never)]);

    expect(csv).toContain('"Склад ""Коледино"", корпус 2"');
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("значение, начинающееся со знака равенства, не становится формулой Excel", () => {
    expect(toCsv([mpRow({ external_id: "=1+1" } as never)])).toContain("'=1+1");
  });

  it("файл начинается с BOM, иначе Excel показывает кириллицу кракозябрами", () => {
    expect(toCsv([]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("что экран обязан сказать про площадку", () => {
  /*
   * «Сбой загрузки — это красная строка, а не пустая таблица» (правило 20a).
   * Пустой столбец «Wildberries» имеет пять разных причин, и владелица не
   * различит их на глаз. Поэтому причина — не обещание в комментарии, а
   * значение, которое считает чистая функция, и вот её пять исходов.
   */
  const run = (over: Record<string, unknown> = {}) => ({
    status: "succeeded",
    is_fixture: false,
    ...over,
  });

  it("нет ключа — «нет подключения», а не «нет заказов»", () => {
    expect(connectionNotice({ connected: false, last_run: null })).toBe("missing");
    /* Даже если прогоны когда-то были: ключа нет — заказов площадки нет вовсе. */
    expect(connectionNotice({ connected: false, last_run: run() })).toBe("missing");
  });

  it("ключ есть, импорт ни разу не запускался — это тоже говорится вслух", () => {
    expect(connectionNotice({ connected: true, last_run: null })).toBe("never_run");
  });

  it("сбой последнего импорта — красная строка", () => {
    expect(connectionNotice({ connected: true, last_run: run({ status: "failed" }) })).toBe(
      "failed"
    );
  });

  it("лимит запросов площадки — свой исход, не «сбой» и не молчание", () => {
    /* WB отвечает 429 и просит подождать; ядро моделирует это третьим состоянием. */
    expect(connectionNotice({ connected: true, last_run: run({ status: "rate_limited" }) })).toBe(
      "rate_limited"
    );
  });

  it("строки из записанных ответов не выдаются за живые", () => {
    expect(connectionNotice({ connected: true, last_run: run({ is_fixture: true }) })).toBe(
      "fixture"
    );
  });

  it("всё в порядке — экран молчит, иначе баннер перестают читать", () => {
    expect(connectionNotice({ connected: true, last_run: run() })).toBeNull();
  });
});
