/**
 * UI калькулятора (t-2026-09-14-02). Здесь ТОЛЬКО отображение и ввод:
 * вся арифметика — в model.js, входы и паспорта источников — в defaults.js.
 * Задача t-2026-09-14-04 берёт model.js + defaults.js и не трогает этот файл.
 */
import { compute, ladder, sensitivity } from "./model.js";
import { DEFAULT_INPUTS, SOURCES, MARKET_ANCHORS, marketMarginalRubPerProduct } from "./defaults.js";

let inp = structuredClone(DEFAULT_INPUTS);

// ── форматирование чисел: единица и смысл всегда рядом (правило 18e) ──
const nf = (v, min = 0, max = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("ru-RU", { minimumFractionDigits: min, maximumFractionDigits: max })
    : "—";
/** Деньги на товар: у мелких величин показываем значащие цифры, а не нули. */
const money = (v) => {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 100) return nf(v, 0, 0);
  if (a >= 1) return nf(v, 2, 2);
  if (a >= 0.01) return nf(v, 4, 4);
  return nf(v, 6, 6);
};
const pct = (v) => nf(v * 100, 1, 1) + " %";

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
};

// ── путь к значению во входах ──
const get = (path) => path.split(".").reduce((o, k) => o[k], inp);
const set = (path, value) => {
  const parts = path.split(".");
  const last = parts.pop();
  parts.reduce((o, k) => o[k], inp)[last] = value;
  render();
};

// ── описание формы: путь, подпись, единица, шаг ──
const FIELDS = [
  ["Трафик магазина", [
    ["traffic.pagesPerVisit", "Страниц за визит", "страниц", 0.1],
    ["traffic.dynamicRequestsPerPage", "SSR-запросов на страницу", "запросов", 0.1],
    ["traffic.apiRequestsPerPage", "API-запросов на страницу", "запросов", 0.1],
    ["traffic.mediaMbPerVisit", "Медиа за визит", "МБ", 0.1],
    ["traffic.peakHourFactor", "Пиковый час к среднему", "×", 0.05],
    ["traffic.peakDayFactor", "Пиковый день к среднему", "×", 0.1],
    ["traffic.burstQuantileZ", "Квантиль запаса на всплеск", "z", 0.01],
    ["traffic.peakHoursPerMonth", "Часов доплаченной ёмкости", "ч/мес", 1],
  ]],
  ["Ёмкость и цена сервера", [
    ["capacity.cpuMsPerDynamicRequest", "CPU на SSR-запрос", "мс", 1],
    ["capacity.cpuMsPerApiRequest", "CPU на API-запрос", "мс", 1],
    ["capacity.targetUtilisation", "Целевая загрузка ядра", "доля", 0.05],
    ["capacity.vcpuPriceRubPerMonth", "Цена vCPU", "₽/мес", 10],
  ]],
  ["Хранение и трафик", [
    ["storage.dbKbPerProduct", "Запись товара в базе", "КБ", 0.1],
    ["storage.dbOverheadFactor", "Множитель индексов и переводов", "×", 0.5],
    ["storage.mediaMbPerProduct", "Медиа на товар", "МБ", 0.1],
    ["storage.storagePriceRubPerGbMonth", "Хранение", "₽/ГБ/мес", 0.1],
    ["storage.egressPriceRubPerGb", "Исходящий трафик", "₽/ГБ", 0.1],
    ["storage.egressFreeGbPerMonth", "Бесплатный исходящий", "ГБ/мес", 10],
  ]],
  ["Парк магазинов (плановый сценарий)", [
    ["fleet.payingStores", "Платящих магазинов", "шт.", 10],
    ["business.avgRevenuePerStoreRubPerMonth", "Средний чек магазина", "₽/мес", 100],
    ["fleet.freePlan.freeStoresPerPayingStore", "Бесплатных на 1 платящего", "шт.", 0.5],
    ["fleet.freePlan.productsPerFreeStore", "Товаров у бесплатного", "шт.", 1],
  ]],
  ["Комиссии, налоги, маржа", [
    ["business.paymentCommissionPct", "Комиссия приёма платежей", "%", 0.5],
    ["business.bankCashoutPct", "Комиссия вывода в наличные", "%", 0.5],
    ["business.usnPct", "УСН «доходы»", "%", 1],
    ["business.fixedContributionsRubPerYear", "Страховые взносы ИП", "₽/год", 1000],
    ["business.vatPct", "НДС вручную", "%", 1],
    ["business.marginPct", "Маржа к себестоимости", "%", 5],
    ["business.marginFixedRubPerProduct", "Маржа фиксированной суммой", "₽/товар/мес", 0.1],
  ]],
  ["Что именно считаем", [
    ["pricing.catalogueSizeForPricing", "Каталог магазина", "товаров", 100],
    ["pricing.includedProducts", "Включено в тариф", "товаров", 50],
    ["pricing.marginalStepProducts", "Шаг предельного расчёта", "товаров", 10],
    ["pricing.roundToRub", "Округление цены до", "₽", 0.01],
    ["fixed.allocationShare", "Доля фикса, отнесённая на товары", "0..1", 0.1],
  ]],
];

function numberRow([path, label, unit, step]) {
  const input = h("input", {
    type: "number",
    step: String(step),
    value: String(get(path)),
    oninput: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) {
        const parts = path.split(".");
        const last = parts.pop();
        parts.reduce((o, k) => o[k], inp)[last] = v;
        renderOutput();
      }
    },
  });
  return h("div", { class: "row" },
    h("label", {}, label, " ", h("span", { class: "u" }, unit)),
    input,
  );
}

function checkRow(path, label, hint) {
  return h("div", { class: "check" },
    h("input", { type: "checkbox", ...(get(path) ? { checked: "" } : {}), onchange: (e) => set(path, e.target.checked) }),
    h("label", {}, label, hint ? h("span", { class: "u" }, " · " + hint) : null),
  );
}

function selectRow(path, label, options) {
  return h("div", { class: "row" },
    h("label", {}, label),
    h("select", { onchange: (e) => set(path, e.target.value) },
      options.map(([v, t]) => h("option", { value: v, ...(get(path) === v ? { selected: "" } : {}) }, t)),
    ),
  );
}

function segmentsTable() {
  const head = h("tr", {},
    h("th", {}, "Сегмент"),
    h("th", { class: "num" }, "Каталог"),
    h("th", { class: "num" }, "База, виз./мес"),
    h("th", { class: "num" }, "Виз./мес на товар"),
    h("th", { class: "num" }, "Доля, %"),
  );
  const rows = inp.segments.map((s, i) => {
    const cell = (key, factor = 1, step = 1) =>
      h("td", { class: "num" }, h("input", {
        type: "number", step: String(step), value: String(Number((s[key] * factor).toFixed(4))),
        oninput: (e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) { inp.segments[i][key] = v / factor; renderOutput(); }
        },
      }));
    return h("tr", {},
      h("td", { title: s.basis }, s.name, h("span", { class: "meaning" }, s.basis)),
      cell("productsTypical", 1, 5),
      cell("baseVisitsPerMonth", 1, 50),
      cell("visitsPerProductPerMonth", 1, 0.1),
      cell("storeShare", 100, 0.1),
    );
  });
  return h("div", { class: "scroll-x" },
    h("table", { class: "seg-table" }, h("thead", {}, head), h("tbody", {}, rows)));
}

function fixedItems() {
  return h("table", {},
    h("thead", {}, h("tr", {},
      h("th", {}, "Платёж"), h("th", { class: "num" }, "₽/мес"), h("th", {}, "Данные"))),
    h("tbody", {}, inp.fixed.items.map((it, i) =>
      h("tr", {},
        h("td", {}, it.name, h("span", { class: "meaning" }, it.source)),
        h("td", { class: "num" }, h("input", {
          type: "number", step: "10", value: it.value === null ? "" : String(it.value),
          placeholder: "нет данных",
          oninput: (e) => {
            const raw = e.target.value.trim();
            inp.fixed.items[i].value = raw === "" ? null : Number(raw);
            renderOutput();
          },
        })),
        h("td", {}, h("button", {
          class: "ghost", type: "button",
          onclick: () => { inp.fixed.items[i].value = it.value === null ? 0 : null; render(); },
        }, it.value === null ? "нет данных" : "обнулить данные")),
      ))),
  );
}

function renderForm() {
  const form = document.getElementById("form");
  form.replaceChildren();
  const segKeys = inp.segments.map((s) => [s.key, s.name]);

  form.append(
    h("fieldset", {}, h("legend", {}, "Сегменты магазинов"),
      h("p", { class: "hint" },
        "Сегмент = полоса размера каталога. Коэффициент «визитов в месяц на 1 товар» — наша калибровка, не замер: открытых данных по этой величине нет."),
      segmentsTable()),
    h("fieldset", {}, h("legend", {}, "Цена какого товара считаем"),
      selectRow("pricing.segmentKey", "Сегмент магазина", segKeys),
      ...FIELDS[5][1].map(numberRow),
      selectRow("fixed.allocation", "Распределять фикс", [["perProduct", "на все товары парка"], ["none", "не распределять"]]),
      selectRow("capacity.poolingMode", "Архитектура", [["shared", "общий пул на все магазины"], ["dedicated", "контейнер на магазин"]]),
    ),
    ...FIELDS.slice(0, 4).map(([title, fields]) =>
      h("fieldset", {}, h("legend", {}, title),
        ...fields.map(numberRow),
        title.startsWith("Хранение")
          ? checkRow("storage.mediaFromServerDisk", "Медиа с диска сервера", "трафик VDS включён в тариф, egress = 0")
          : null,
        title.startsWith("Парк")
          ? checkRow("fleet.freePlan.enabled", "Учитывать магазины на бесплатном тарифе", "их нагрузку несут платные товары")
          : null,
        title.startsWith("Парк")
          ? selectRow("fleet.freePlan.segmentKey", "Сегмент бесплатного магазина", segKeys)
          : null,
      )),
    h("fieldset", {}, h("legend", {}, "Комиссии, налоги, маржа"),
      ...FIELDS[4][1].map(numberRow),
      checkRow("business.usnReduceTaxByContributions", "Уменьшать УСН на страховые взносы", "ИП без работников — до нуля"),
      checkRow("business.vatAuto", "Ставку НДС выбирать по выручке", "ФЗ-425: порог 20 млн ₽/год"),
      checkRow("business.vatInsidePrice", "НДС внутри цены", "иначе цена указывается без НДС"),
    ),
  );
}

// ── правая колонка ──
function lineRow(label, value, meaning, cls) {
  return h("tr", { class: cls || "" },
    h("td", {}, label, meaning ? h("span", { class: "meaning" }, meaning) : null),
    h("td", { class: "num" }, money(value)),
  );
}

function visitsTable(r) {
  const v = r.store.visits;
  const rows = [
    ["Месяц", v.month, "визитов/мес"],
    ["Неделя", v.week, "визитов/нед"],
    ["Сутки", v.day, "визитов/сут"],
    ["Час", v.hourAvg, "визитов/ч в среднем часу"],
    ["Час пиковый", v.hourPeak, "визитов/ч в пиковый час пикового дня"],
    ["Минута", v.minuteAvg, "визитов/мин в среднем часу"],
    ["Минута пиковая", v.minutePeak, "визитов/мин в пиковый час"],
    ["Секунда", v.secondAvg, "визитов/с в среднем часу"],
    ["Секунда пиковая", v.secondPeak, "визитов/с в пиковый час"],
  ];
  return h("table", {},
    h("thead", {}, h("tr", {},
      h("th", {}, "Диапазон"), h("th", { class: "num" }, "Посетителей"), h("th", {}, "Что это значит"))),
    h("tbody", {}, rows.map(([k, val, meaning]) =>
      h("tr", {}, h("td", {}, k), h("td", { class: "num" }, nf(val, 0, val < 10 ? 4 : 0)), h("td", { class: "kicker" }, meaning))),
      h("tr", {},
        h("td", {}, "Между визитами"),
        h("td", { class: "num" }, nf(v.secondsBetweenVisitsPeak, 0, 0)),
        h("td", { class: "kicker" }, "секунд между посетителями в пиковый час")),
    ),
  );
}

function poolTable(r) {
  const p = r.poolAll;
  const rows = [
    ["Магазинов в пуле", nf(p.stores, 0, 0), "шт., платные и бесплатные"],
    ["Товаров в пуле", nf(p.products, 0, 0), "шт."],
    ["Визитов в пуле", nf(p.visitsMonth, 0, 0), "визитов/мес"],
    ["Запросов в среднем часу", nf(p.lambdaAvg, 0, 2), "запросов/с"],
    ["Запросов в пиковый час", nf(p.lambdaPeak, 0, 2), "запросов/с"],
    ["vCPU под средний час", nf(p.vcpuBase, 0, 2), "ядер, с запасом на всплеск"],
    ["vCPU под пиковый час", nf(p.vcpuPeak, 0, 2), "ядер, с запасом на всплеск"],
    ["Базовая подписка на серверы", nf(p.cpuBaseRub, 0, 0) + " ₽", "₽/мес, платим все часы"],
    ["Доплата за пиковую ёмкость", nf(p.cpuPeakRub, 0, 0) + " ₽", "₽/мес, только пиковые часы"],
    ["Хранение каталога и медиа", nf(p.storageRub, 0, 0) + " ₽", "₽/мес"],
    ["Исходящий трафик", nf(p.egressRub, 0, 0) + " ₽", `₽/мес, ${nf(p.egressGb, 0, 0)} ГБ всего`],
    ["Инфраструктура пула", nf(p.totalRub, 0, 0) + " ₽", "₽/мес, без фиксированных платежей"],
  ];
  return h("table", {},
    h("thead", {}, h("tr", {}, h("th", {}, "Показатель"), h("th", { class: "num" }, "Значение"), h("th", {}, "Единица и смысл"))),
    h("tbody", {}, rows.map(([k, v, m]) => h("tr", {}, h("td", {}, k), h("td", { class: "num" }, v), h("td", { class: "kicker" }, m)))),
  );
}

function sourcesBlock() {
  const tag = (k) => h("span", { class: "tag " + k },
    { measured: "замер", published: "публикация", assumed: "допущение", planned: "план" }[k] || k);
  return h("details", {}, h("summary", {}, "Откуда цифры: паспорт каждого входа"),
    Object.entries(SOURCES).map(([key, s]) =>
      h("div", { class: "src" },
        tag(s.kind), h("b", {}, key), s.unit ? ` · ${s.unit}` : "",
        h("div", {}, s.source, s.fetched ? ` · получено ${s.fetched}` : ""),
        s.note ? h("div", { class: "kicker" }, s.note) : null)),
  );
}

function renderOutput() {
  const r = compute(inp);
  const out = document.getElementById("out");
  const extra = Math.max(0, inp.pricing.catalogueSizeForPricing - inp.pricing.includedProducts);
  const bill = extra * r.lines.price;

  const sens = sensitivity(inp, [
    { path: "capacity.cpuMsPerDynamicRequest", label: "CPU на SSR-запрос — главное неизмеренное допущение", factors: [0.5, 1, 2, 5] },
    { path: "segments.3.visitsPerProductPerMonth", label: "Визитов на товар в сегменте «Крупный каталог»", factors: [0.5, 1, 2, 5] },
    { path: "fleet.payingStores", label: "Размер парка платящих магазинов", factors: [0.1, 1, 5, 10] },
    { path: "traffic.peakDayFactor", label: "Пиковый день к среднему", factors: [1, 2, 5] },
    { path: "fleet.freePlan.freeStoresPerPayingStore", label: "Бесплатных магазинов на платящего", factors: [0, 1, 3] },
  ]);

  out.replaceChildren(
    h("div", { class: "eyebrow" }, "результат"),
    h("div", { class: "headline" },
      h("div", { class: "kicker" }, "Цена одного товара сверх включённых в тариф"),
      h("div", { class: "big" }, nf(r.lines.price, 2, 4), " ₽"),
      h("div", { class: "unit" }, "за один товар в месяц · до округления ", money(r.lines.priceRaw), " ₽ · ",
        "это ", money(r.lines.price * 100), " ₽ за 100 товаров"),
      h("p", { class: "hint" },
        `Магазин сегмента «${r.segment.name}» с каталогом ${nf(inp.pricing.catalogueSizeForPricing, 0, 0)} товаров: ` +
        `${nf(extra, 0, 0)} товаров сверх ${nf(inp.pricing.includedProducts, 0, 0)} включённых = ${nf(bill, 0, 2)} ₽/мес доплаты ` +
        `к подписке ${nf(inp.business.avgRevenuePerStoreRubPerMonth, 0, 0)} ₽.`),
    ),

    r.warnings.length
      ? h("div", { class: "warn" }, h("b", {}, "Чего в модели нет"),
          h("ul", {}, r.warnings.map((w) => h("li", {}, w))))
      : null,

    h("h2", {}, "Из чего сложилась цена"),
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Строка"), h("th", { class: "num" }, "₽/товар/мес"))),
      h("tbody", {},
        lineRow("Предельная инфраструктура", r.lines.infra, "прирост стоимости пула от одного товара: CPU, хранение, трафик"),
        lineRow("Доля фиксированных платежей", r.lines.fixedShare, `${nf(r.rates.fixedTotal, 0, 0)} ₽/мес на ${nf(r.fleet.paidProducts, 0, 0)} платных товаров`),
        lineRow("Нагрузка бесплатных тарифов", r.lines.freeLoad, inp.fleet.freePlan.enabled
          ? `${nf(r.fleet.freeStores, 0, 0)} магазинов, ${nf(r.fleet.freeProducts, 0, 0)} товаров, ${nf(r.fleet.freeTotalRub, 0, 0)} ₽/мес`
          : "переключатель выключен"),
        lineRow("Себестоимость", r.lines.cost, "сумма трёх строк выше", "total"),
        lineRow("Маржа бизнеса", r.lines.margin, `${nf(inp.business.marginPct, 0, 1)} % к себестоимости плюс ${money(inp.business.marginFixedRubPerProduct)} ₽ фиксированно`),
        lineRow("Нужно получить на руки", r.lines.net, "себестоимость плюс маржа"),
        lineRow("Комиссия приёма платежей", r.lines.commission, `${nf(inp.business.paymentCommissionPct, 0, 1)} % выручки`),
        lineRow("Комиссия вывода средств", r.lines.bank, `${nf(inp.business.bankCashoutPct, 0, 1)} % выручки`),
        lineRow("НДС", r.lines.vat, `ставка ${nf(r.rates.vatPct, 0, 0)} % · ${r.rates.vatNote}`),
        lineRow("УСН", r.lines.usn, `${nf(inp.business.usnPct, 0, 1)} % доходов`),
        lineRow("Цена товара", r.lines.price, `итог с округлением вверх до ${money(inp.pricing.roundToRub)} ₽; удержания забирают ${pct(r.rates.deductions)} выручки`, "total"),
      ),
    ),

    h("h2", {}, "Посетители магазина по диапазонам времени"),
    h("p", { class: "hint" },
      `Магазин сегмента «${r.segment.name}», каталог ${nf(inp.pricing.catalogueSizeForPricing, 0, 0)} товаров: ` +
      `база ${nf(r.segment.baseVisitsPerMonth, 0, 0)} визитов/мес плюс ${nf(r.segment.visitsPerProductPerMonth, 0, 2)} визита на каждый товар.`),
    visitsTable(r),

    h("h2", {}, "Инфраструктура всего парка"),
    poolTable(r),

    h("h2", {}, "Ступенчатая шкала"),
    h("p", { class: "hint" },
      "Коэффициент визитов на товар падает с ростом каталога, поэтому предельная себестоимость товара в большом каталоге ниже. Плоская цена на каталоге в 100 000 товаров даёт счёт, которого рынок не платит."),
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Полоса"), h("th", { class: "num" }, "Себестоимость"), h("th", { class: "num" }, "Цена: сырая → округлённая"), h("th", { class: "num" }, "Счёт за 1 000 товаров"))),
      h("tbody", {}, ladder(inp).map((s) =>
        h("tr", {}, h("td", {}, s.label),
          h("td", { class: "num" }, money(s.cost)),
          h("td", { class: "num" }, money(s.priceRaw) + " ₽ → " + money(s.price) + " ₽"),
          h("td", { class: "num" }, nf(s.price * 1000, 0, 0) + " ₽")))),
    ),

    h("h2", {}, "Сверка с рынком"),
    h("p", { class: "hint" }, MARKET_ANCHORS.source, " · получено ", MARKET_ANCHORS.fetched),
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Шаг чужой сетки"), h("th", { class: "num" }, "₽/товар/мес"), h("th", {}, "Наша цена"))),
      h("tbody", {}, MARKET_ANCHORS.steps.map((s) =>
        h("tr", {}, h("td", {}, s.label),
          h("td", { class: "num" }, money(marketMarginalRubPerProduct(s))),
          h("td", { class: "kicker" }, money(r.lines.price) + " ₽ — " +
            (r.lines.price > marketMarginalRubPerProduct(s) ? "дороже рынка" : "дешевле рынка"))))),
    ),

    h("h2", {}, "Чувствительность: что будет, если допущение ошиблось"),
    h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Вход"), h("th", { class: "num" }, "×0,1"), h("th", { class: "num" }, "×0,5"), h("th", { class: "num" }, "×1"), h("th", { class: "num" }, "×2"), h("th", { class: "num" }, "×5"), h("th", { class: "num" }, "×10"))),
      h("tbody", {}, sens.map((s) => {
        const byFactor = Object.fromEntries(s.variants.map((v) => [v.factor, v.priceRaw]));
        const cell = (k) => h("td", { class: "num" }, k in byFactor ? money(byFactor[k]) : "·");
        return h("tr", {}, h("td", {}, s.label), cell(0.1), cell(0.5), cell(1), cell(2), cell(5), cell(10));
      })),
    ),
    h("p", { class: "hint" }, "Цены в таблице — ₽ за товар в месяц ДО округления (округление до шага скрыло бы половину разницы). Множитель применяется к значению входа. «·» — вариант не считался."),

    sourcesBlock(),
  );
}

function render() {
  renderForm();
  renderOutput();
}

document.getElementById("reset").addEventListener("click", () => {
  inp = structuredClone(DEFAULT_INPUTS);
  render();
});
document.getElementById("theme").addEventListener("click", (e) => {
  const light = document.documentElement.classList.toggle("light");
  e.target.textContent = light ? "Тёмная тема" : "Светлая тема";
});

render();
