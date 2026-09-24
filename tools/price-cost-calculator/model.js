/**
 * Модель себестоимости и цены дополнительного товара сверх включённых в тариф.
 * Задача t-2026-09-14-02. Документ модели: artifacts/docs/2026-09-14-price-cost-model.md
 *
 * ЭТОТ ФАЙЛ — ЕДИНСТВЕННЫЙ ИСТОЧНИК РАСЧЁТА. В нём нет импортов UI, DOM, сети и времени:
 * чистые функции над простым объектом входов. Задача t-2026-09-14-04 переносит его
 * в расширение панели администратора как есть (ESM, JSDoc-типы, `model.d.ts` рядом).
 *
 * Единицы названы в имени поля или в JSDoc каждой величины (правило 18e).
 * Значение `null` во входах = «данных нет»: строка не участвует в сумме и попадает
 * в `warnings`, вместо неё НЕ подставляется правдоподобная цифра (правила 17a, 20a).
 */

/** Среднее число суток в месяце (григорианский год / 12). */
export const DAYS_PER_MONTH = 30.4375;
/** Часов в среднем месяце — база почасовой тарификации провайдера. */
export const HOURS_PER_MONTH = DAYS_PER_MONTH * 24; // 730,5

/**
 * @typedef {Object} Segment
 * @property {string} key
 * @property {string} name
 * @property {string} basis                     чем обоснованы границы сегмента
 * @property {number} productsTypical           типичный каталог сегмента, товаров
 * @property {number} baseVisitsPerMonth        визитов/мес, не зависящих от числа товаров
 * @property {number} visitsPerProductPerMonth  визитов/мес на 1 товар каталога
 * @property {number} storeShare                доля магазинов сегмента в парке, 0..1
 */

/**
 * @typedef {Object} VisitRates
 * @property {number} month     визитов/мес
 * @property {number} week      визитов/нед
 * @property {number} day       визитов/сут
 * @property {number} hourAvg   визитов/ч в среднем часу
 * @property {number} hourPeak  визитов/ч в пиковом часу пикового дня
 * @property {number} minuteAvg визитов/мин в среднем часу
 * @property {number} minutePeak визитов/мин в пиковом часу
 * @property {number} secondAvg визитов/с в среднем часу
 * @property {number} secondPeak визитов/с в пиковом часу
 * @property {number} secondsBetweenVisitsPeak секунд между визитами в пике (1/secondPeak)
 */

/**
 * Посетители магазина по диапазонам времени.
 * Пик = среднечасовой × суточная неравномерность × дневная (промо/сезон).
 * @param {number} visitsPerMonth
 * @param {{peakHourFactor:number, peakDayFactor:number}} traffic
 * @returns {VisitRates}
 */
export function visitsByRange(visitsPerMonth, traffic) {
  const month = visitsPerMonth;
  const day = month / DAYS_PER_MONTH;
  const hourAvg = day / 24;
  const hourPeak = hourAvg * traffic.peakHourFactor * traffic.peakDayFactor;
  const secondPeak = hourPeak / 3600;
  return {
    month,
    week: day * 7,
    day,
    hourAvg,
    hourPeak,
    minuteAvg: hourAvg / 60,
    minutePeak: hourPeak / 60,
    secondAvg: hourAvg / 3600,
    secondPeak,
    secondsBetweenVisitsPeak: secondPeak > 0 ? 1 / secondPeak : Infinity,
  };
}

/** Визитов/мес у магазина сегмента с каталогом `products`. */
export function storeVisitsPerMonth(segment, products) {
  return segment.baseVisitsPerMonth + products * segment.visitsPerProductPerMonth;
}

/** Запросов к приложению на один визит (страницы × (SSR + API)). */
export function requestsPerVisit(traffic) {
  return traffic.pagesPerVisit * (traffic.dynamicRequestsPerPage + traffic.apiRequestsPerPage);
}

/** Средневзвешенное CPU-время одного запроса, мс. */
export function cpuMsPerRequest(traffic, capacity) {
  const dyn = traffic.dynamicRequestsPerPage;
  const api = traffic.apiRequestsPerPage;
  const total = dyn + api;
  if (total === 0) return 0;
  return (dyn * capacity.cpuMsPerDynamicRequest + api * capacity.cpuMsPerApiRequest) / total;
}

/**
 * Ёмкость покупается не под среднее, а под всплеск: приходы запросов — пуассоновский
 * поток, у которого при интенсивности λ запр./с стандартное отклонение равно √λ.
 * Планируем на квантиль λ + z·√λ (z = 3,09 → 99,9 %). Для малых λ слагаемое √λ
 * доминирует — поэтому маленький магазин нельзя считать по среднему.
 * @param {number} lambdaRps λ, запросов/с
 * @param {number} z квантиль нормальной аппроксимации
 * @returns {number} расчётная нагрузка, запросов/с
 */
export function planningRps(lambdaRps, z) {
  if (lambdaRps <= 0) return 0;
  return lambdaRps + z * Math.sqrt(lambdaRps);
}

/** Сколько vCPU нужно, чтобы держать `rps` запросов по `ms` CPU при загрузке `util`. */
export function vcpuFor(rps, ms, util) {
  if (util <= 0) return Infinity;
  return (rps * ms) / 1000 / util;
}

/**
 * Инфраструктура одного магазина: ₽/мес и промежуточные величины.
 * Дробные vCPU — намеренно: магазины делят общий пул, целое ядро на магазин
 * не покупается (см. §4.3 документа модели).
 * @returns {{visits:VisitRates, rpsAvg:number, rpsPeak:number, vcpuBase:number,
 *   vcpuPeak:number, cpuRub:number, cpuBaseRub:number, cpuPeakRub:number,
 *   storageRub:number, egressRub:number, totalRub:number}}
 */
export function storeInfra(segment, products, inp) {
  const { traffic, capacity, storage } = inp;
  const visits = visitsByRange(storeVisitsPerMonth(segment, products), traffic);
  const rpv = requestsPerVisit(traffic);
  const ms = cpuMsPerRequest(traffic, capacity);

  const rpsAvg = visits.secondAvg * rpv;
  const rpsPeak = visits.secondPeak * rpv;
  const vcpuBase = vcpuFor(planningRps(rpsAvg, traffic.burstQuantileZ), ms, capacity.targetUtilisation);
  const vcpuPeak = vcpuFor(planningRps(rpsPeak, traffic.burstQuantileZ), ms, capacity.targetUtilisation);
  const vcpuExtra = Math.max(0, vcpuPeak - vcpuBase);

  // База платится все часы месяца, доплата за пик — только пиковые часы (почасовая тарификация).
  const cpuBaseRub = vcpuBase * capacity.vcpuPriceRubPerMonth;
  const cpuPeakRub =
    vcpuExtra * capacity.vcpuPriceRubPerMonth * (traffic.peakHoursPerMonth / HOURS_PER_MONTH);

  const dbGb = (products * storage.dbKbPerProduct * storage.dbOverheadFactor) / (1024 * 1024);
  const mediaGb = (products * storage.mediaMbPerProduct) / 1024;
  const storageRub = (dbGb + mediaGb) * storage.storagePriceRubPerGbMonth;

  const egressGb = (visits.month * traffic.mediaMbPerVisit) / 1024;
  const egressRub = storage.mediaFromServerDisk ? 0 : egressGb * storage.egressPriceRubPerGb;

  return {
    visits,
    rpsAvg,
    rpsPeak,
    vcpuBase,
    vcpuPeak,
    cpuBaseRub,
    cpuPeakRub,
    cpuRub: cpuBaseRub + cpuPeakRub,
    storageRub,
    egressRub,
    totalRub: cpuBaseRub + cpuPeakRub + storageRub + egressRub,
  };
}

/**
 * Предельная (маржинальная) инфраструктура ОДНОГО дополнительного товара:
 * разность стоимости магазина с каталогом `products + 1` и `products`.
 * Считается разностью, а не делением, потому что зависимость нелинейна (√λ).
 */
export function marginalInfra(segment, products, inp) {
  const a = storeInfra(segment, products, inp);
  const b = storeInfra(segment, products + 1, inp);
  return {
    cpuRub: b.cpuRub - a.cpuRub,
    storageRub: b.storageRub - a.storageRub,
    egressRub: b.egressRub - a.egressRub,
    totalRub: b.totalRub - a.totalRub,
    visitsPerMonth: b.visits.month - a.visits.month,
  };
}

/** Сумма известных фиксированных платежей; строки со значением null — в warnings. */
export function fixedMonthly(items) {
  let sum = 0;
  const unknown = [];
  for (const it of items) {
    if (it.value === null || it.value === undefined) unknown.push(it.name);
    else sum += it.value;
  }
  return { sum, unknown };
}

/**
 * Состав парка: список «магазин × сколько таких × сколько товаров».
 * @param {*} inp
 * @param {boolean} includeFree учитывать ли магазины на бесплатном тарифе
 * @param {{segmentKey:string, products:number}|null} extra добавочные товары одного магазина
 */
export function fleetRoster(inp, includeFree, extra = null) {
  const rows = inp.segments.map((s) => ({
    segment: s,
    paid: true,
    storeCount: inp.fleet.payingStores * s.storeShare,
    products: s.productsTypical,
  }));
  if (includeFree && inp.fleet.freePlan.enabled) {
    const fp = inp.fleet.freePlan;
    const seg = inp.segments.find((s) => s.key === fp.segmentKey) || inp.segments[0];
    rows.push({
      segment: seg,
      paid: false,
      storeCount: inp.fleet.payingStores * fp.freeStoresPerPayingStore,
      products: fp.productsPerFreeStore,
    });
  }
  if (extra && extra.products) {
    const seg = inp.segments.find((s) => s.key === extra.segmentKey) || inp.segments[0];
    // Добавочные товары живут в ОДНОМ магазине: он уже посчитан выше, добавляем только прирост.
    rows.push({ segment: seg, paid: true, storeCount: 1, products: extra.products, addon: true });
  }
  return rows;
}

/**
 * Общий пул: все магазины парка обслуживает одна ферма приложений.
 *
 * Почему не сумма по магазинам: всплески разных магазинов независимы, поэтому
 * запас на пик в общем пуле растёт как z·√Λ от СУММАРНОЙ интенсивности, а не как
 * сумма z·√λ по каждому. Это и есть экономия масштаба, ради которой платформа
 * держит общий пул, а не контейнер на магазин.
 *
 * Пики магазинов считаются СОВПАДАЮЩИМИ (одна страна, один вечер) — оценка сверху.
 */
export function pool(inp, includeFree, extra = null) {
  const { traffic, capacity, storage } = inp;
  const rpv = requestsPerVisit(traffic);
  const ms = cpuMsPerRequest(traffic, capacity);

  let lambdaAvg = 0; // запросов/с в среднем часу по всему парку
  let lambdaPeak = 0; // запросов/с в пиковом часу
  let visitsMonth = 0;
  let products = 0;
  let paidProducts = 0;
  let stores = 0;

  for (const row of fleetRoster(inp, includeFree, extra)) {
    const v = visitsByRange(
      row.addon
        ? row.products * row.segment.visitsPerProductPerMonth // прирост визитов от добавочных товаров
        : storeVisitsPerMonth(row.segment, row.products),
      traffic,
    );
    lambdaAvg += row.storeCount * v.secondAvg * rpv;
    lambdaPeak += row.storeCount * v.secondPeak * rpv;
    visitsMonth += row.storeCount * v.month;
    products += row.storeCount * row.products;
    if (row.paid) paidProducts += row.storeCount * row.products;
    if (!row.addon) stores += row.storeCount;
  }

  const vcpuBase = vcpuFor(planningRps(lambdaAvg, traffic.burstQuantileZ), ms, capacity.targetUtilisation);
  const vcpuPeak = vcpuFor(planningRps(lambdaPeak, traffic.burstQuantileZ), ms, capacity.targetUtilisation);
  const vcpuExtra = Math.max(0, vcpuPeak - vcpuBase);
  const cpuBaseRub = vcpuBase * capacity.vcpuPriceRubPerMonth;
  const cpuPeakRub =
    vcpuExtra * capacity.vcpuPriceRubPerMonth * (traffic.peakHoursPerMonth / HOURS_PER_MONTH);

  const dbGb = (products * storage.dbKbPerProduct * storage.dbOverheadFactor) / (1024 * 1024);
  const mediaGb = (products * storage.mediaMbPerProduct) / 1024;
  const storageRub = (dbGb + mediaGb) * storage.storagePriceRubPerGbMonth;

  const egressGb = (visitsMonth * traffic.mediaMbPerVisit) / 1024;
  const billableEgressGb = Math.max(0, egressGb - (storage.egressFreeGbPerMonth || 0));
  const egressRub = storage.mediaFromServerDisk ? 0 : billableEgressGb * storage.egressPriceRubPerGb;

  return {
    stores,
    products,
    paidProducts,
    visitsMonth,
    lambdaAvg,
    lambdaPeak,
    vcpuBase,
    vcpuPeak,
    cpuBaseRub,
    cpuPeakRub,
    cpuRub: cpuBaseRub + cpuPeakRub,
    storageRub,
    egressGb,
    egressRub,
    totalRub: cpuBaseRub + cpuPeakRub + storageRub + egressRub,
  };
}

/**
 * Предельная инфраструктура одного дополнительного товара.
 * `shared` — прирост стоимости ПУЛА (по умолчанию: наша архитектура — общий пул);
 * `dedicated` — прирост стоимости ОТДЕЛЬНОГО магазина (контейнер на магазин).
 */
export function marginalInfraRub(inp) {
  const segKey = inp.pricing.segmentKey;
  if (inp.capacity.poolingMode === "dedicated") {
    const seg = inp.segments.find((s) => s.key === segKey) || inp.segments[0];
    return marginalInfra(seg, inp.pricing.catalogueSizeForPricing, inp).totalRub;
  }
  const free = inp.fleet.freePlan.enabled;
  const step = inp.pricing.marginalStepProducts || 100;
  const a = pool(inp, free, null);
  const b = pool(inp, free, { segmentKey: segKey, products: step });
  return (b.totalRub - a.totalRub) / step;
}

/** Что стоит парку присутствие магазинов на бесплатном тарифе, ₽/мес (прирост к пулу). */
export function freePlanCostRub(inp) {
  if (!inp.fleet.freePlan.enabled) return 0;
  return pool(inp, true).totalRub - pool(inp, false).totalRub;
}

/**
 * Ставка НДС по выручке за год (ФЗ-425 от 28.11.2025, ст. 145 и 164 НК РФ):
 * до 20 млн ₽ — освобождение, 20–250 млн — 5 %, 250–450 млн — 7 %.
 */
export function vatRateForRevenue(revenueRubPerYear) {
  if (revenueRubPerYear <= 20_000_000) return { pct: 0, note: "освобождение: выручка ≤ 20 млн ₽/год" };
  if (revenueRubPerYear <= 250_000_000) return { pct: 5, note: "20–250 млн ₽/год" };
  if (revenueRubPerYear <= 450_000_000) return { pct: 7, note: "250–450 млн ₽/год" };
  return { pct: null, note: "выше 450 млн ₽/год — право на УСН утрачено, модель не применима" };
}

/** Округление вверх до шага (цена не может быть ниже расчётной). */
export function roundUpTo(value, step) {
  if (!step || step <= 0) return value;
  return Math.ceil(value / step - 1e-9) * step;
}

/**
 * Полный расчёт: себестоимость → маржа → комиссии и налоги → цена N.
 * Все строки результата — ₽ на ОДИН дополнительный товар в МЕСЯЦ.
 */
export function compute(inp) {
  const warnings = [];
  const poolPaid = pool(inp, false);
  const poolAll = pool(inp, inp.fleet.freePlan.enabled);
  const fx = fixedMonthly(inp.fixed.items);
  if (fx.unknown.length) {
    warnings.push(
      `Фиксированные платежи: ${fx.unknown.length} строк(и) без данных, в сумму не вошли — ${fx.unknown.join(", ")}`,
    );
  }

  const shareSum = inp.segments.reduce((a, s) => a + s.storeShare, 0);
  if (Math.abs(shareSum - 1) > 0.005) {
    warnings.push(
      `Доли сегментов в сумме дают ${(shareSum * 100).toFixed(1)} %, а не 100 % — парк посчитан по этой сумме, недостающее просто не существует в модели`,
    );
  }

  const seg = inp.segments.find((s) => s.key === inp.pricing.segmentKey) || inp.segments[0];
  const P = inp.pricing.catalogueSizeForPricing;
  const revenueRubPerYear = inp.fleet.payingStores * inp.business.avgRevenuePerStoreRubPerMonth * 12;

  // Взносы ИП: у ИП без работников на УСН «доходы» налог уменьшается на взносы
  // вплоть до нуля, поэтому при достаточной выручке отдельной строкой их не платим.
  const contributionsMonthly =
    inp.business.usnReduceTaxByContributions &&
    revenueRubPerYear * (inp.business.usnPct / 100) >= inp.business.fixedContributionsRubPerYear
      ? 0
      : inp.business.fixedContributionsRubPerYear / 12;

  const fixedTotal = fx.sum + contributionsMonthly;
  const paidProducts = poolPaid.paidProducts || 1;
  const fixedPerProduct =
    inp.fixed.allocation === "none" ? 0 : (fixedTotal * inp.fixed.allocationShare) / paidProducts;

  const infraPerProduct = marginalInfraRub(inp);
  const freeTotalRub = inp.fleet.freePlan.enabled ? poolAll.totalRub - poolPaid.totalRub : 0;
  const freeLoadRub = freeTotalRub / paidProducts;

  const cost = infraPerProduct + fixedPerProduct + freeLoadRub;
  const marginRub = cost * (inp.business.marginPct / 100) + inp.business.marginFixedRubPerProduct;
  const net = cost + marginRub;

  const vat = inp.business.vatAuto
    ? vatRateForRevenue(revenueRubPerYear)
    : { pct: inp.business.vatPct, note: "ставка задана вручную" };
  if (vat.pct === null) warnings.push(`НДС: ${vat.note}`);
  const vatPct = vat.pct ?? 0;
  const vatShare = inp.business.vatInsidePrice ? vatPct / (100 + vatPct) : 0;
  const commShare = inp.business.paymentCommissionPct / 100;
  const bankShare = inp.business.bankCashoutPct / 100;
  const usnShare = (inp.business.usnPct / 100) * (1 - vatShare);
  const deductions = commShare + bankShare + vatShare + usnShare;

  let gross;
  if (deductions >= 1) {
    warnings.push("Комиссии и налоги в сумме ≥ 100 % выручки — цена не определена");
    gross = Infinity;
  } else {
    gross = net / (1 - deductions);
  }
  const price = roundUpTo(gross, inp.pricing.roundToRub);

  return {
    warnings,
    segment: seg,
    catalogueSize: P,
    poolPaid,
    poolAll,
    fleet: {
      paidProducts,
      freeStores: inp.fleet.freePlan.enabled
        ? inp.fleet.payingStores * inp.fleet.freePlan.freeStoresPerPayingStore
        : 0,
      freeProducts: inp.fleet.freePlan.enabled
        ? inp.fleet.payingStores * inp.fleet.freePlan.freeStoresPerPayingStore * inp.fleet.freePlan.productsPerFreeStore
        : 0,
      freeTotalRub,
      revenueRubPerMonth: revenueRubPerYear / 12,
      revenueRubPerYear,
    },
    lines: {
      infra: infraPerProduct,
      fixedShare: fixedPerProduct,
      freeLoad: freeLoadRub,
      cost,
      margin: marginRub,
      net,
      commission: gross * commShare,
      bank: gross * bankShare,
      vat: gross * vatShare,
      usn: gross * usnShare,
      priceRaw: gross,
      price,
    },
    rates: { vatPct, vatNote: vat.note, deductions, contributionsMonthly, fixedTotal },
    store: storeInfra(seg, P, inp),
  };
}

/**
 * Ступенчатая шкала: цена за товар считается отдельно для каждой полосы каталога,
 * потому что коэффициент визитов на товар падает с ростом каталога (длинный хвост).
 */
export function ladder(inp) {
  return inp.pricing.ladder.map((step) => {
    const patched = {
      ...inp,
      pricing: { ...inp.pricing, catalogueSizeForPricing: step.at, segmentKey: step.segmentKey },
    };
    const r = compute(patched);
    return { ...step, price: r.lines.price, priceRaw: r.lines.priceRaw, cost: r.lines.cost };
  });
}

/**
 * Чувствительность: как двигается N, если допущение ошиблось в разы.
 * `path` — путь к числу во входах, `factors` — во сколько раз его менять.
 */
export function sensitivity(inp, specs) {
  const b = compute(inp);
  const base = b.lines.price;
  const baseRaw = b.lines.priceRaw;
  return specs.map((spec) => {
    const variants = spec.factors.map((k) => {
      const copy = structuredClone(inp);
      const parts = spec.path.split(".");
      let node = copy;
      for (const p of parts.slice(0, -1)) node = node[p];
      const last = parts[parts.length - 1];
      node[last] = node[last] * k;
      const r = compute(copy);
      return { factor: k, price: r.lines.price, priceRaw: r.lines.priceRaw, cost: r.lines.cost };
    });
    return { ...spec, base, baseRaw, variants };
  });
}
