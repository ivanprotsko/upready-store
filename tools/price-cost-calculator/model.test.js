/**
 * Тесты модели (t-2026-09-14-02). Запуск: node --test из tools/price-cost-calculator.
 * Проверяется арифметика и поведение переключателей, а НЕ правдоподобие допущений:
 * допущения проверяются заменой на замер, см. MEASURE.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  visitsByRange,
  storeVisitsPerMonth,
  requestsPerVisit,
  planningRps,
  vcpuFor,
  pool,
  fixedMonthly,
  vatRateForRevenue,
  roundUpTo,
  compute,
  ladder,
  sensitivity,
  DAYS_PER_MONTH,
} from "./model.js";
import { DEFAULT_INPUTS, MARKET_ANCHORS, marketMarginalRubPerProduct } from "./defaults.js";

const clone = (o) => structuredClone(o);

test("диапазоны времени согласованы между собой", () => {
  const r = visitsByRange(30000, { peakHourFactor: 1.5, peakDayFactor: 2 });
  assert.equal(r.month, 30000);
  assert.ok(Math.abs(r.day - 30000 / DAYS_PER_MONTH) < 1e-9);
  assert.ok(Math.abs(r.week - r.day * 7) < 1e-9);
  assert.ok(Math.abs(r.hourAvg * 24 - r.day) < 1e-9);
  assert.ok(Math.abs(r.minuteAvg * 60 - r.hourAvg) < 1e-9);
  assert.ok(Math.abs(r.secondAvg * 3600 - r.hourAvg) < 1e-9);
  assert.ok(Math.abs(r.hourPeak - r.hourAvg * 3) < 1e-9, "пик = среднее × 1,5 × 2");
  assert.ok(Math.abs(r.secondsBetweenVisitsPeak * r.secondPeak - 1) < 1e-9);
});

test("нулевой трафик не ломает обратную величину", () => {
  const r = visitsByRange(0, { peakHourFactor: 1.5, peakDayFactor: 2 });
  assert.equal(r.secondPeak, 0);
  assert.equal(r.secondsBetweenVisitsPeak, Infinity);
});

test("визиты магазина растут линейно от каталога", () => {
  const s = { baseVisitsPerMonth: 100, visitsPerProductPerMonth: 2 };
  assert.equal(storeVisitsPerMonth(s, 0), 100);
  assert.equal(storeVisitsPerMonth(s, 500), 1100);
});

test("запас на всплеск: λ + z√λ, и при малой λ он больше самой λ", () => {
  assert.equal(planningRps(0, 3.09), 0);
  assert.ok(Math.abs(planningRps(100, 3) - (100 + 30)) < 1e-9);
  const small = planningRps(0.01, 3.09);
  assert.ok(small > 0.3, `при λ=0,01 запас доминирует, получено ${small}`);
});

test("vCPU считается от rps, CPU-времени и целевой загрузки", () => {
  assert.ok(Math.abs(vcpuFor(10, 100, 0.5) - 2) < 1e-12); // 10 rps × 0,1 с / 0,5
});

test("общий пул дешевле суммы отдельных магазинов (экономия на всплесках)", () => {
  const inp = clone(DEFAULT_INPUTS);
  const shared = pool(inp, false).cpuRub;
  const dedicated = inp.segments.reduce((acc, s) => {
    const one = clone(inp);
    one.segments = [{ ...s, storeShare: 1 }];
    one.fleet.payingStores = 1;
    return acc + inp.fleet.payingStores * s.storeShare * pool(one, false).cpuRub;
  }, 0);
  assert.ok(shared < dedicated, `пул ${shared} должен быть дешевле ${dedicated}`);
});

test("строки без данных не превращаются в ноль, а попадают в warnings", () => {
  const { sum, unknown } = fixedMonthly([
    { name: "a", value: 100 },
    { name: "b", value: null },
  ]);
  assert.equal(sum, 100);
  assert.deepEqual(unknown, ["b"]);
  const r = compute(DEFAULT_INPUTS);
  assert.ok(r.warnings.some((w) => w.includes("Фиксированные платежи")));
});

test("порог НДС по ФЗ-425: 20 млн ₽ — граница освобождения", () => {
  assert.equal(vatRateForRevenue(19_999_999).pct, 0);
  assert.equal(vatRateForRevenue(20_000_000).pct, 0);
  assert.equal(vatRateForRevenue(20_000_001).pct, 5);
  assert.equal(vatRateForRevenue(250_000_001).pct, 7);
  assert.equal(vatRateForRevenue(450_000_001).pct, null);
});

test("цена накручивается на комиссии и налоги, а не уменьшается ими", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.pricing.roundToRub = 0;
  // взносы держим постоянными: при usnPct = 0 налог перестаёт их поглощать,
  // и себестоимость выросла бы по другой причине — это проверяет отдельный тест
  inp.business.usnReduceTaxByContributions = false;
  const base = compute(inp);
  const noFees = clone(inp);
  noFees.business.paymentCommissionPct = 0;
  noFees.business.usnPct = 0;
  const bare = compute(noFees);
  assert.ok(base.lines.priceRaw > bare.lines.priceRaw);
  // выручка минус удержания = чистая потребность
  const net = base.lines.priceRaw * (1 - base.rates.deductions);
  assert.ok(Math.abs(net - base.lines.net) < 1e-12);
});

test("маржа видна отдельной строкой и слушается процента и фиксированной суммы", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.pricing.roundToRub = 0;
  const a = compute(inp);
  assert.ok(Math.abs(a.lines.margin - a.lines.cost * 0.3) < 1e-12);
  const b = clone(inp);
  b.business.marginFixedRubPerProduct = 1;
  const r = compute(b);
  assert.ok(Math.abs(r.lines.margin - (r.lines.cost * 0.3 + 1)) < 1e-12);
  assert.ok(r.lines.price > a.lines.price + 1);
});

test("переключатель бесплатных тарифов меняет результат", () => {
  const on = clone(DEFAULT_INPUTS);
  on.pricing.roundToRub = 0;
  const off = clone(on);
  off.fleet.freePlan.enabled = false;
  const rOn = compute(on);
  const rOff = compute(off);
  assert.ok(rOn.lines.freeLoad > 0);
  assert.equal(rOff.lines.freeLoad, 0);
  assert.ok(rOn.lines.price > rOff.lines.price, "с бесплатными тарифами товар дороже");
});

test("доля фиксированных платежей падает с ростом парка", () => {
  const small = clone(DEFAULT_INPUTS);
  small.pricing.roundToRub = 0;
  small.fleet.payingStores = 20;
  const big = clone(small);
  big.fleet.payingStores = 2000;
  assert.ok(compute(small).lines.fixedShare > 10 * compute(big).lines.fixedShare * 0.9);
  assert.ok(compute(small).lines.price > compute(big).lines.price);
});

test("отключённое распределение фикса обнуляет свою строку", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.fixed.allocation = "none";
  assert.equal(compute(inp).lines.fixedShare, 0);
});

test("медиа с диска сервера обнуляет исходящий трафик", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.storage.mediaFromServerDisk = true;
  assert.equal(pool(inp, true).egressRub, 0);
  assert.ok(pool(inp, true).totalRub < pool(DEFAULT_INPUTS, true).totalRub);
});

test("предельная себестоимость товара падает с ростом каталога (длинный хвост)", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.pricing.roundToRub = 0;
  const large = compute({ ...inp, pricing: { ...inp.pricing, segmentKey: "large", catalogueSizeForPricing: 750 } });
  const feed = compute({ ...inp, pricing: { ...inp.pricing, segmentKey: "feed", catalogueSizeForPricing: 5000 } });
  assert.ok(feed.lines.infra < large.lines.infra);
});

test("округление цены идёт вверх, а не к ближайшему", () => {
  assert.equal(roundUpTo(0.0735, 0.05), 0.1);
  assert.equal(roundUpTo(0.1, 0.05), 0.1);
  assert.equal(roundUpTo(0.101, 0.05), 0.15000000000000002); // float64, отображение округляет
  assert.equal(roundUpTo(1.23, 0), 1.23);
});

test("лестница даёт цену на каждую полосу каталога", () => {
  const l = ladder(DEFAULT_INPUTS);
  assert.equal(l.length, DEFAULT_INPUTS.pricing.ladder.length);
  for (const step of l) assert.ok(step.price > 0 && Number.isFinite(step.price));
});

test("чувствительность возвращает цену для каждого множителя и не трогает исходные входы", () => {
  const snapshot = JSON.stringify(DEFAULT_INPUTS);
  const s = sensitivity(DEFAULT_INPUTS, [
    { path: "capacity.cpuMsPerDynamicRequest", label: "CPU на запрос", factors: [0.5, 2] },
  ]);
  assert.equal(s[0].variants.length, 2);
  assert.ok(s[0].variants[1].price >= s[0].variants[0].price);
  assert.equal(JSON.stringify(DEFAULT_INPUTS), snapshot, "входы не должны мутировать");
});

test("рыночный якорь inSales считается из опубликованной сетки", () => {
  const [small, large] = MARKET_ANCHORS.steps.map(marketMarginalRubPerProduct);
  assert.ok(Math.abs(small - 7100 / 9000) < 1e-9);
  assert.ok(Math.abs(large - 20100 / 290000) < 1e-9);
  assert.ok(large < small, "у крупных каталогов предельная цена ниже");
});

test("запросов на визит = страницы × (SSR + API)", () => {
  assert.equal(requestsPerVisit({ pagesPerVisit: 2, dynamicRequestsPerPage: 1, apiRequestsPerPage: 2 }), 6);
});

test("взносы ИП: налог их поглощает при достаточной выручке и не поглощает при малой", () => {
  const inp = clone(DEFAULT_INPUTS);
  inp.pricing.roundToRub = 0;
  assert.equal(compute(inp).rates.contributionsMonthly, 0, "6 % с 10,8 млн ₽ больше 57 390 ₽");
  const tiny = clone(inp);
  tiny.fleet.payingStores = 10; // выручка 540 тыс. ₽/год, 6 % = 32,4 тыс. < 57 390 ₽
  const r = compute(tiny);
  assert.ok(Math.abs(r.rates.contributionsMonthly - 57390 / 12) < 1e-9);
  assert.ok(r.lines.fixedShare > compute(inp).lines.fixedShare);
});
