/**
 * Генератор числовых таблиц для artifacts/docs/2026-09-14-price-cost-model.md.
 * Запуск: node report.mjs > /tmp/report.md — цифры в документе воспроизводятся этой командой.
 */
import { compute, ladder, sensitivity, pool, visitsByRange, storeVisitsPerMonth } from "./model.js";
import { DEFAULT_INPUTS as D, MARKET_ANCHORS, marketMarginalRubPerProduct } from "./defaults.js";

const n = (v, d = 2) => Number(v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
const m = (v) => (Math.abs(v) >= 1 ? n(v, 2) : Math.abs(v) >= 0.01 ? n(v, 4) : n(v, 6));
const clone = (o) => structuredClone(o);
const row = (...c) => console.log("| " + c.join(" | ") + " |");

console.log("## Т1. Посетители по сегментам\n");
row("Сегмент", "Каталог, товаров", "Визитов/мес", "Визитов/сут", "Визитов/ч (пик)", "Секунд между визитами (пик)");
row("---", "---:", "---:", "---:", "---:", "---:");
for (const s of D.segments) {
  const v = visitsByRange(storeVisitsPerMonth(s, s.productsTypical), D.traffic);
  row(s.name, n(s.productsTypical, 0), n(v.month, 0), n(v.day, 0), n(v.hourPeak, 1), n(v.secondsBetweenVisitsPeak, 0));
}

console.log("\n## Т2. Полный ряд диапазонов для магазина, по которому считается цена\n");
const r = compute(D);
const v = r.store.visits;
row("Диапазон", "Среднее", "Пик", "Единица");
row("---", "---:", "---:", "---");
row("Месяц", n(v.month, 0), "—", "визитов/мес");
row("Неделя", n(v.week, 0), "—", "визитов/нед");
row("Сутки", n(v.day, 0), "—", "визитов/сут");
row("Час", n(v.hourAvg, 2), n(v.hourPeak, 2), "визитов/ч");
row("Минута", n(v.minuteAvg, 3), n(v.minutePeak, 3), "визитов/мин");
row("Секунда", n(v.secondAvg, 5), n(v.secondPeak, 5), "визитов/с");

console.log("\n## Т3. Инфраструктура парка\n");
const pPaid = pool(D, false), pAll = pool(D, true);
row("Показатель", "Только платные", "С бесплатными", "Единица");
row("---", "---:", "---:", "---");
row("Магазинов", n(pPaid.stores, 0), n(pAll.stores, 0), "шт.");
row("Товаров", n(pPaid.products, 0), n(pAll.products, 0), "шт.");
row("Визитов", n(pPaid.visitsMonth, 0), n(pAll.visitsMonth, 0), "визитов/мес");
row("Запросов в средний час", n(pPaid.lambdaAvg, 2), n(pAll.lambdaAvg, 2), "запросов/с");
row("Запросов в пиковый час", n(pPaid.lambdaPeak, 2), n(pAll.lambdaPeak, 2), "запросов/с");
row("vCPU под средний час", n(pPaid.vcpuBase, 2), n(pAll.vcpuBase, 2), "ядер с запасом");
row("vCPU под пиковый час", n(pPaid.vcpuPeak, 2), n(pAll.vcpuPeak, 2), "ядер с запасом");
row("Базовая подписка", n(pPaid.cpuBaseRub, 0), n(pAll.cpuBaseRub, 0), "₽/мес");
row("Доплата за пик", n(pPaid.cpuPeakRub, 0), n(pAll.cpuPeakRub, 0), "₽/мес");
row("Хранение", n(pPaid.storageRub, 0), n(pAll.storageRub, 0), "₽/мес");
row("Исходящий трафик", n(pPaid.egressRub, 0), n(pAll.egressRub, 0), "₽/мес");
row("**Итого инфраструктура**", n(pPaid.totalRub, 0), n(pAll.totalRub, 0), "₽/мес");

console.log("\n## Т4. Из чего складывается цена\n");
row("Строка", "₽/товар/мес", "Что это");
row("---", "---:", "---");
row("Предельная инфраструктура", m(r.lines.infra), "прирост стоимости пула от одного товара");
row("Доля фиксированных платежей", m(r.lines.fixedShare), `${n(r.rates.fixedTotal, 0)} ₽/мес на ${n(r.fleet.paidProducts, 0)} платных товаров`);
row("Нагрузка бесплатных тарифов", m(r.lines.freeLoad), `${n(r.fleet.freeStores, 0)} магазинов, ${n(r.fleet.freeTotalRub, 0)} ₽/мес`);
row("**Себестоимость**", m(r.lines.cost), "сумма трёх строк");
row("Маржа", m(r.lines.margin), `${n(D.business.marginPct, 0)} % к себестоимости`);
row("Нужно на руки", m(r.lines.net), "себестоимость + маржа");
row("Комиссия Tribute", m(r.lines.commission), `${n(D.business.paymentCommissionPct, 0)} % выручки`);
row("УСН", m(r.lines.usn), `${n(D.business.usnPct, 0)} % доходов`);
row("НДС", m(r.lines.vat), `${n(r.rates.vatPct, 0)} % — ${r.rates.vatNote}`);
row("**Цена N**", m(r.lines.price), `до округления ${m(r.lines.priceRaw)} ₽`);

console.log("\n## Т5. Цена по сегментам\n");
row("Сегмент", "Каталог", "Себестоимость, ₽/товар/мес", "Цена до округления", "Цена N с округлением", "Счёт за 1 000 сверхлимитных товаров, ₽/мес");
row("---", "---:", "---:", "---:", "---:", "---:");
for (const s of D.segments) {
  const x = compute({ ...D, pricing: { ...D.pricing, segmentKey: s.key, catalogueSizeForPricing: Math.max(s.productsTypical, 500) } });
  row(s.name, n(Math.max(s.productsTypical, 500), 0), m(x.lines.cost), m(x.lines.priceRaw), m(x.lines.price), n(x.lines.priceRaw * 1000, 0));
}

console.log("\n## Т6. Ступенчатая шкала\n");
row("Полоса", "Себестоимость", "Цена до округления", "Цена N", "Счёт за 1 000 товаров");
row("---", "---:", "---:", "---:", "---:");
for (const s of ladder(D)) row(s.label, m(s.cost), m(s.priceRaw) + " ₽", m(s.price) + " ₽", n(s.priceRaw * 1000, 0) + " ₽");

console.log("\n## Т7. Сверка с рынком\n");
row("Шаг чужой сетки", "₽/товар/мес");
row("---", "---:");
for (const s of MARKET_ANCHORS.steps) row(s.label, m(marketMarginalRubPerProduct(s)));
row("**Наша модель**", m(r.lines.priceRaw) + " (до округления)");

console.log("\n## Т8. Чувствительность (цены до округления, ₽/товар/мес)\n");
const specs = [
  { path: "capacity.cpuMsPerDynamicRequest", label: "CPU на SSR-запрос", factors: [0.5, 1, 2, 5] },
  { path: "segments.3.visitsPerProductPerMonth", label: "Визитов на товар, «Крупный каталог»", factors: [0.5, 1, 2, 5] },
  { path: "fleet.payingStores", label: "Платящих магазинов в парке", factors: [0.1, 1, 5, 10] },
  { path: "traffic.peakDayFactor", label: "Пиковый день к среднему", factors: [0.5, 1, 2, 5] },
  { path: "fleet.freePlan.freeStoresPerPayingStore", label: "Бесплатных на платящего", factors: [0, 1, 2, 5] },
  { path: "business.marginPct", label: "Маржа", factors: [0, 1, 2, 5] },
];
row("Вход", "×0,1 или 0", "×0,5 или 1", "×1", "×2", "×5", "×10");
row("---", "---:", "---:", "---:", "---:", "---:", "---:");
for (const s of sensitivity(D, specs)) {
  const by = Object.fromEntries(s.variants.map((x) => [x.factor, m(x.priceRaw)]));
  row(s.label, by[0.1] ?? by[0] ?? "·", by[0.5] ?? by[1] ?? "·", by[1] ?? "·", by[2] ?? "·", by[5] ?? "·", by[10] ?? "·");
}

console.log("\n## Т9. Крайние варианты\n");
const variants = [
  ["Без распределения фикса", (i) => { i.fixed.allocation = "none"; }],
  ["Бесплатные тарифы не учитываем", (i) => { i.fleet.freePlan.enabled = false; }],
  ["Медиа с диска сервера", (i) => { i.storage.mediaFromServerDisk = true; }],
  ["Контейнер на магазин вместо пула", (i) => { i.capacity.poolingMode = "dedicated"; }],
  ["Парк 20 магазинов", (i) => { i.fleet.payingStores = 20; }],
  ["Парк 2 000 магазинов", (i) => { i.fleet.payingStores = 2000; }],
  ["Выручка выше порога НДС (400 магазинов)", (i) => { i.fleet.payingStores = 400; }],
  ["Маржа 300 %", (i) => { i.business.marginPct = 300; }],
];
row("Вариант", "Себестоимость", "Цена до округления", "Цена N", "Отличие по цене до округления");
row("---", "---:", "---:", "---:", "---:");
for (const [label, patch] of variants) {
  const i = clone(D); patch(i);
  const x = compute(i);
  row(label, m(x.lines.cost), m(x.lines.priceRaw), m(x.lines.price), n((x.lines.priceRaw / r.lines.priceRaw - 1) * 100, 0) + " %");
}

console.log("\n## Т10. Предупреждения модели на значениях по умолчанию\n");
for (const w of r.warnings) console.log("- " + w);
