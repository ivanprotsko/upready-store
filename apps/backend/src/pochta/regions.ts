/**
 * One ordinary post-office index per region, for the public-calculator estimate
 * to a «Почта Еком» point (46df-pochta).
 *
 * Why this exists: a «Почта Еком» point has a virtual 98xxxx index, and the
 * public calculator refuses every retail object to it («Доставка … в ППВЗ не
 * осуществляется», measured 2026-09-29). The retail «Посылка» price depends on
 * the pair of regions, not on the street, so the main post office of the
 * point's region gives the same price and a term within a day of the real
 * one. With the shop's user key the contract ECOM tariff to the point itself
 * replaces this estimate (`src/pochta/quote.ts`).
 *
 * Every index below was checked against `tariff.pochta.ru` on 2026-09-29: each
 * answered HTTP 200 and named the office in the right region (for example
 * 143401 «КРАСНОГОРСК 1», regionid 50). The keys are the distinctive word of
 * the region as the delivery-point directory spells it («обл. Московская»,
 * «край Краснодарский», «Чувашия Чувашская Республика -»), lower-case, with
 * «ё» folded to «е». The list covers the 67 regions the directory held that
 * day; a point in any other region gets no estimate and so no price.
 */
export const REGION_REFERENCE_INDEX: Array<[stem: string, index: string]> = [
  ["санкт-петербург", "190000"],
  ["ленинградская", "188300"],
  ["московская", "143401"],
  ["москва", "101000"],
  ["воронежская", "394000"],
  ["краснодарский", "350000"],
  ["коми", "167000"],
  ["новосибирская", "630000"],
  ["саратовская", "410000"],
  ["белгородская", "308000"],
  ["пермский", "614000"],
  ["чеченская", "364000"],
  ["брянская", "241000"],
  ["курская", "305000"],
  ["тульская", "300000"],
  ["орловская", "302000"],
  ["волгоградская", "400000"],
  ["пензенская", "440000"],
  ["приморский", "690000"],
  ["липецкая", "398000"],
  ["адыгея", "385000"],
  ["свердловская", "620000"],
  ["томская", "634000"],
  ["омская", "644000"],
  ["калужская", "248000"],
  ["дагестан", "367000"],
  ["самарская", "443000"],
  ["алтайский", "656000"],
  ["вологодская", "160000"],
  ["карачаево-черкесская", "369000"],
  ["якути", "677000"],
  ["нижегородская", "603000"],
  ["татарстан", "420000"],
  ["ростовская", "344000"],
  ["тверская", "170000"],
  ["красноярский", "660000"],
  ["владимирская", "600000"],
  ["челябинская", "454000"],
  ["хабаровский", "680000"],
  ["ставропольский", "355000"],
  ["кабардино-балкарская", "360000"],
  ["башкортостан", "450000"],
  ["чувашск", "428000"],
  ["архангельская", "163000"],
  ["кировская", "610000"],
  ["рязанская", "390000"],
  ["ульяновская", "432000"],
  ["карелия", "185000"],
  ["хакасия", "655000"],
  ["курганская", "640000"],
  ["ярославская", "150000"],
  ["северная осетия", "362000"],
  ["удмуртская", "426000"],
  ["оренбургская", "460000"],
  ["ивановская", "153000"],
  ["тюменская", "625000"],
  ["астраханская", "414000"],
  ["калмыкия", "358000"],
  ["марий эл", "424000"],
  ["кемеровская", "650000"],
  ["псковская", "180000"],
  ["тамбовская", "392000"],
  ["мурманская", "183000"],
  ["костромская", "156000"],
  ["смоленская", "214000"],
  ["иркутская", "664000"],
  ["новгородская", "173000"],
];

/**
 * Longest stem first: «томская» and «костромская» both contain «омская», and a
 * shorter stem tried first would send Tomsk and Kostroma parcels to Omsk.
 */
const BY_LENGTH = [...REGION_REFERENCE_INDEX].sort((a, b) => b[0].length - a[0].length);

const fold = (value: string): string => value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/**
 * The reference index for a region as the directory (or a buyer's address)
 * names it, or `null`. The match is a substring of the whole stem; Yakutia is
 * keyed on «якути» because «саха» sits inside «Сахалинская».
 */
export const referenceIndexForRegion = (region?: string | null): string | null => {
  if (!region) return null;
  const folded = fold(region);
  for (const [stem, index] of BY_LENGTH) {
    if (folded.includes(stem)) return index;
  }
  return null;
};
