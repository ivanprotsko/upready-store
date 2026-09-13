/**
 * Типы модели для потребителей на TypeScript (t-2026-09-14-04 — расширение панели
 * администратора). Рантайм — `model.js`, здесь только контракт входов и выходов.
 */

export interface Segment {
  key: string;
  name: string;
  /** Чем обоснованы границы сегмента (источник с датой). */
  basis: string;
  /** Типичный каталог сегмента, товаров. */
  productsTypical: number;
  /** Визитов/мес, не зависящих от числа товаров. */
  baseVisitsPerMonth: number;
  /** Визитов/мес на один товар каталога. */
  visitsPerProductPerMonth: number;
  /** Доля магазинов сегмента в парке, 0..1. */
  storeShare: number;
}

export interface TrafficInputs {
  pagesPerVisit: number;
  dynamicRequestsPerPage: number;
  apiRequestsPerPage: number;
  mediaMbPerVisit: number;
  /** Пиковый час к среднему часу, ×. */
  peakHourFactor: number;
  /** Пиковый день к среднему дню, ×. */
  peakDayFactor: number;
  /** Квантиль запаса на всплеск: λ + z·√λ. */
  burstQuantileZ: number;
  /** Часов в месяц, когда оплачивается дополнительная ёмкость. */
  peakHoursPerMonth: number;
}

export interface CapacityInputs {
  cpuMsPerDynamicRequest: number;
  cpuMsPerApiRequest: number;
  /** Целевая загрузка ядра, 0..1. */
  targetUtilisation: number;
  vcpuPriceRubPerMonth: number;
  /** "shared" — общий пул на все магазины; "dedicated" — контейнер на магазин. */
  poolingMode: "shared" | "dedicated";
}

export interface StorageInputs {
  dbKbPerProduct: number;
  dbOverheadFactor: number;
  mediaMbPerProduct: number;
  storagePriceRubPerGbMonth: number;
  egressPriceRubPerGb: number;
  egressFreeGbPerMonth: number;
  /** Медиа с диска сервера: исходящий трафик входит в тариф VDS. */
  mediaFromServerDisk: boolean;
}

/** Значение `null` = данных нет; строка не входит в сумму и попадает в warnings. */
export interface FixedItem {
  name: string;
  value: number | null;
  source: string;
}

export interface Inputs {
  segments: Segment[];
  traffic: TrafficInputs;
  capacity: CapacityInputs;
  storage: StorageInputs;
  fixed: {
    allocation: "perProduct" | "none";
    /** Какая доля фиксированных платежей относится на товары, 0..1. */
    allocationShare: number;
    items: FixedItem[];
  };
  fleet: {
    payingStores: number;
    freePlan: {
      enabled: boolean;
      freeStoresPerPayingStore: number;
      productsPerFreeStore: number;
      segmentKey: string;
    };
  };
  business: {
    paymentCommissionPct: number;
    bankCashoutPct: number;
    usnPct: number;
    fixedContributionsRubPerYear: number;
    usnReduceTaxByContributions: boolean;
    vatAuto: boolean;
    vatPct: number;
    vatInsidePrice: boolean;
    marginPct: number;
    marginFixedRubPerProduct: number;
    avgRevenuePerStoreRubPerMonth: number;
  };
  pricing: {
    segmentKey: string;
    catalogueSizeForPricing: number;
    includedProducts: number;
    marginalStepProducts: number;
    roundToRub: number;
    ladder: Array<{ label: string; at: number; segmentKey: string }>;
  };
}

export interface VisitRates {
  month: number; week: number; day: number;
  hourAvg: number; hourPeak: number;
  minuteAvg: number; minutePeak: number;
  secondAvg: number; secondPeak: number;
  secondsBetweenVisitsPeak: number;
}

export interface PoolResult {
  stores: number; products: number; paidProducts: number; visitsMonth: number;
  lambdaAvg: number; lambdaPeak: number; vcpuBase: number; vcpuPeak: number;
  cpuBaseRub: number; cpuPeakRub: number; cpuRub: number;
  storageRub: number; egressGb: number; egressRub: number; totalRub: number;
}

/** Все строки — ₽ на один дополнительный товар в месяц. */
export interface PriceLines {
  infra: number; fixedShare: number; freeLoad: number; cost: number;
  margin: number; net: number; commission: number; bank: number;
  vat: number; usn: number; priceRaw: number; price: number;
}

export interface ComputeResult {
  warnings: string[];
  segment: Segment;
  catalogueSize: number;
  poolPaid: PoolResult;
  poolAll: PoolResult;
  fleet: {
    paidProducts: number; freeStores: number; freeProducts: number; freeTotalRub: number;
    revenueRubPerMonth: number; revenueRubPerYear: number;
  };
  lines: PriceLines;
  rates: { vatPct: number; vatNote: string; deductions: number; contributionsMonthly: number; fixedTotal: number };
  store: { visits: VisitRates } & Record<string, unknown>;
}

export declare const DAYS_PER_MONTH: number;
export declare const HOURS_PER_MONTH: number;
export declare function visitsByRange(visitsPerMonth: number, traffic: Pick<TrafficInputs, "peakHourFactor" | "peakDayFactor">): VisitRates;
export declare function storeVisitsPerMonth(segment: Segment, products: number): number;
export declare function requestsPerVisit(traffic: TrafficInputs): number;
export declare function cpuMsPerRequest(traffic: TrafficInputs, capacity: CapacityInputs): number;
export declare function planningRps(lambdaRps: number, z: number): number;
export declare function vcpuFor(rps: number, ms: number, util: number): number;
export declare function storeInfra(segment: Segment, products: number, inp: Inputs): Record<string, number> & { visits: VisitRates };
export declare function marginalInfra(segment: Segment, products: number, inp: Inputs): Record<string, number>;
export declare function fixedMonthly(items: FixedItem[]): { sum: number; unknown: string[] };
export declare function fleetRoster(inp: Inputs, includeFree: boolean, extra?: { segmentKey: string; products: number } | null): Array<Record<string, unknown>>;
export declare function pool(inp: Inputs, includeFree: boolean, extra?: { segmentKey: string; products: number } | null): PoolResult;
export declare function marginalInfraRub(inp: Inputs): number;
export declare function freePlanCostRub(inp: Inputs): number;
export declare function vatRateForRevenue(revenueRubPerYear: number): { pct: number | null; note: string };
export declare function roundUpTo(value: number, step: number): number;
export declare function compute(inp: Inputs): ComputeResult;
export declare function ladder(inp: Inputs): Array<{ label: string; at: number; segmentKey: string; price: number; priceRaw: number; cost: number }>;
export declare function sensitivity(inp: Inputs, specs: Array<{ path: string; label: string; factors: number[] }>): Array<{ path: string; label: string; base: number; baseRaw: number; variants: Array<{ factor: number; price: number; priceRaw: number; cost: number }> }>;
