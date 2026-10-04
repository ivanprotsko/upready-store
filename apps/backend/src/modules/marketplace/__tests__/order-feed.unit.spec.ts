import {
  DEFAULT_PERIOD_DAYS,
  MP_ORDERS_CSV_COLUMNS,
  NO_SCHEME,
  compareMpOrders,
  matchesMpOrdersQuery,
  mpOrderToRow,
  resolveMpOrdersQuery,
  resolvePage,
  resolvePeriod,
  selectMpOrders,
  toAmount,
  toMpOrdersCsv,
  type FeedRow,
} from "../order-feed";
import { connectionNotice } from "../order-feed";
import { ORDER_STATUS_LABELS, statusKeyOf } from "../order-status";
import { canonicalScheme } from "../scheme";

/**
 * The pure half of «Wildberries → Заказы» (w15-mp-orders-desk, one
 * marketplace since mp-section-design task-04).
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
    "RUB",
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
  const dated = mpRow();
  const undated = mpRow({ id: "mporder_2", ordered_at: null });

  it("в списке есть и считается в undated, пока дата не выбрана", () => {
    const selection = selectMpOrders([undated, dated], resolveMpOrdersQuery({}));

    expect(selection.rows.map((row) => row.id)).toEqual(["mporder_1", "mporder_2"]);
    expect(selection.undated).toBe(1);
    expect(selection.total).toBe(2);
  });

  it("не попадает ни в один фильтр по дате — вместо того чтобы попасть во все", () => {
    const query = resolveMpOrdersQuery({ ordered_at: '{"$gte":"2000-01-01T00:00:00.000Z"}' });

    expect(matchesMpOrdersQuery(undated, query)).toBe(false);
    expect(matchesMpOrdersQuery(dated, query)).toBe(true);
    /* undated считается по всем заказам площадки, а не по отфильтрованным. */
    expect(selectMpOrders([undated, dated], query).undated).toBe(1);
  });
});

describe("сортировка", () => {
  const rows = [
    mpRow({ id: "mporder_a", ordered_at: null, total: null, external_id: "30" }),
    mpRow({ id: "mporder_b", ordered_at: new Date("2026-09-10T10:00:00.000Z"), total: 500, external_id: "4" }),
    mpRow({ id: "mporder_c", ordered_at: new Date("2026-09-12T10:00:00.000Z"), total: 1500, external_id: "200" }),
  ];
  const ids = (order: string) =>
    [...rows].sort(compareMpOrders(resolveMpOrdersQuery({ order }).sort)).map((row) => row.id);

  it("по умолчанию — сначала новые", () => {
    expect(resolveMpOrdersQuery({}).sort).toEqual({ field: "ordered_at", desc: true });
    expect(ids("")).toEqual(["mporder_c", "mporder_b", "mporder_a"]);
  });

  it("заказ без даты последний в обе стороны: он не самый старый и не самый новый", () => {
    expect(ids("-ordered_at").at(-1)).toBe("mporder_a");
    expect(ids("ordered_at")).toEqual(["mporder_b", "mporder_c", "mporder_a"]);
  });

  it("пустая сумма тоже последняя, а не «бесплатный» заказ наверху", () => {
    expect(ids("total")).toEqual(["mporder_b", "mporder_c", "mporder_a"]);
    expect(ids("-total")).toEqual(["mporder_c", "mporder_b", "mporder_a"]);
  });

  it("номер сравнивается как число: 4 раньше 30, 30 раньше 200", () => {
    expect(ids("number")).toEqual(["mporder_b", "mporder_a", "mporder_c"]);
  });

  it("неизвестное поле — порядок по умолчанию, а не ошибка", () => {
    expect(resolveMpOrdersQuery({ order: "-buyer_name" }).sort).toEqual({
      field: "ordered_at",
      desc: true,
    });
  });

  it("равные значения разводятся по id, чтобы граница страницы не теряла строк", () => {
    const twins = [mpRow({ id: "mporder_z" }), mpRow({ id: "mporder_y" })];
    expect(twins.sort(compareMpOrders({ field: "ordered_at", desc: true })).map((row) => row.id)).toEqual([
      "mporder_y",
      "mporder_z",
    ]);
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
    mpRow({ id: "mporder_2", status: "cancel", status_detail: "canceled", buyer_region: "Московская область" }),
    mpRow({ id: "mporder_3", scheme: null, status: null, status_detail: null, external_id: "8a3f0c" }),
  ];

  it("неизвестное значение в ссылке отбрасывается, а не обнуляет таблицу", () => {
    const query = resolveMpOrdersQuery({ status: "delivered,нет", scheme: "fbs,NONE" });

    expect(query.statuses).toEqual(["delivered"]);
    expect(query.schemes).toEqual(["FBS", NO_SCHEME]);
  });

  it("статус и схема сужают список; «none» — заказы без схемы", () => {
    const cancelled = resolveMpOrdersQuery({ status: "cancelled" });
    expect(rows.filter((row) => matchesMpOrdersQuery(row, cancelled)).map((row) => row.id)).toEqual([
      "mporder_2",
    ]);

    const none = resolveMpOrdersQuery({ scheme: "none" });
    expect(rows.filter((row) => matchesMpOrdersQuery(row, none)).map((row) => row.id)).toEqual([
      "mporder_3",
    ]);
  });

  it("поиск — по номеру и по региону, без учёта регистра", () => {
    const byNumber = resolveMpOrdersQuery({ q: "8A3F" });
    expect(rows.filter((row) => matchesMpOrdersQuery(row, byNumber)).map((row) => row.id)).toEqual([
      "mporder_3",
    ]);

    const byRegion = resolveMpOrdersQuery({ q: "  московская " });
    expect(rows.filter((row) => matchesMpOrdersQuery(row, byRegion)).map((row) => row.id)).toEqual([
      "mporder_2",
    ]);
  });

  it("дата: границы $gte и $lte включительно, как пишет фильтр панели", () => {
    const query = resolveMpOrdersQuery({
      ordered_at: JSON.stringify({ $gte: "2026-09-10T10:00:00.000Z", $lte: "2026-09-10T10:00:00.000Z" }),
    });
    expect(matchesMpOrdersQuery(mpRow(), query)).toBe(true);

    const later = resolveMpOrdersQuery({ ordered_at: { $gt: "2026-09-10T10:00:00.000Z" } });
    expect(matchesMpOrdersQuery(mpRow(), later)).toBe(false);
  });

  it("испорченный фильтр даты — 400, а не молча неотфильтрованный список", () => {
    expect(() => resolveMpOrdersQuery({ ordered_at: "{не json" })).toThrow(/ordered_at/);
    expect(() => resolveMpOrdersQuery({ ordered_at: '{"$gte":"вчера"}' })).toThrow(/не дата/);
    expect(() => resolveMpOrdersQuery({ ordered_at: '{"$ne":"2026-09-10"}' })).toThrow(/оператор/);
  });

  it("счётчики фильтров считаются по всем заказам площадки, до фильтров", () => {
    const selection = selectMpOrders(rows, resolveMpOrdersQuery({ status: "cancelled" }));

    expect(selection.rows).toHaveLength(1);
    expect(selection.facets.statuses).toEqual([
      { value: "delivered", label: "Доставлен", count: 1 },
      { value: "cancelled", label: "Отменён", count: 1 },
      { value: "unspecified", label: "Статус площадка не присылает", count: 1 },
    ]);
    expect(selection.facets.schemes).toEqual([
      { value: "FBS", label: "FBS", count: 2 },
      { value: NO_SCHEME, label: "Без схемы", count: 1 },
    ]);
  });

  it("страница: 20 по умолчанию, не больше 200, отрицательный сдвиг — ноль", () => {
    expect(resolvePage({})).toEqual({ limit: 20, offset: 0 });
    expect(resolvePage({ limit: "5000", offset: "-3" })).toEqual({ limit: 200, offset: 0 });
    expect(resolvePage({ limit: "20", offset: "40" })).toEqual({ limit: 20, offset: 40 });
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

describe("валюта", () => {
  it("сумма — в валюте продавца, код из заказа — валюта страны покупателя", () => {
    /*
     * WB кладёт в total convertedPrice / finished_price — это рубли продавца,
     * а currency заказа — страна покупателя (замер в analytics.ts: «685 BYN»
     * за карточку ценой 919 ₽). «1 291,56 ₸» над рублёвой суммой — неправда.
     */
    const row = mpOrderToRow(
      {
        id: "mporder_kz",
        marketplace: "wb",
        external_id: "1",
        scheme: "FBS",
        status: "new",
        status_detail: "waiting",
        ordered_at: null,
        buyer_region: null,
        warehouse_name: null,
        total: "1291.56",
        currency: "KZT",
        is_cancelled: false,
      },
      1,
      "RUB",
    );

    expect(row.currency).toBe("RUB");
    expect(row.buyer_currency).toBe("KZT");
  });

  it("валюта продавца неизвестна — валюта не выдумывается", () => {
    expect(mpOrderToRow({ ...mpRow(), id: "x", marketplace: "wb", external_id: "1", status: null, status_detail: null, total: 1, currency: "BYN", is_cancelled: false } as never, 1).currency).toBeNull();
  });
});

describe("CSV", () => {
  const rows = [mpRow(), mpRow({ id: "mporder_2", external_id: "987", total: "1290.5" })];

  it("строк в файле ровно столько же, сколько в списке, плюс заголовок", () => {
    const csv = toMpOrdersCsv(rows);
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(rows.length + 1);
    /* Заголовок идёт после BOM — его и проверяем, BOM отдельным тестом ниже. */
    expect(lines[0]).toBe(`\ufeff${MP_ORDERS_CSV_COLUMNS.join(";")}`);
  });

  it("разделитель — точка с запятой, сумма с запятой: так читает русский Excel", () => {
    const [, first, second] = toMpOrdersCsv(rows).trimEnd().split("\r\n");

    expect(first.split(";")).toHaveLength(MP_ORDERS_CSV_COLUMNS.length);
    expect(first).toContain(";1290;RUB;RUB;1");
    expect(second).toContain(";1290,5;RUB;RUB;");
  });

  it("пустой список даёт файл с одним заголовком, а не пустой файл", () => {
    expect(toMpOrdersCsv([]).trimEnd().split("\r\n")).toHaveLength(1);
  });

  it("точка с запятой и кавычка внутри значения не ломают колонки", () => {
    const csv = toMpOrdersCsv([mpRow({ warehouse_name: 'Склад "Коледино"; корпус 2' })]);

    expect(csv).toContain('"Склад ""Коледино""; корпус 2"');
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("значение, начинающееся со знака равенства, не становится формулой Excel", () => {
    expect(toMpOrdersCsv([mpRow({ external_id: "=1+1" })])).toContain("'=1+1");
  });

  it("файл начинается с BOM, иначе Excel показывает кириллицу кракозябрами", () => {
    expect(toMpOrdersCsv([]).charCodeAt(0)).toBe(0xfeff);
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
