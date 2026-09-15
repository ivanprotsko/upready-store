/**
 * Ready-made delivery zones inside Russia, the nine a shop owner is asked for
 * first: Moscow, Saint Petersburg, and the seven federal districts around them
 * («цена за кг по зонам», Oksana's own request #463839).
 *
 * A preset is a NAME plus a list of `ru-regions.ts` codes. Nothing here is a
 * row in the database: creating a method from a preset writes its provinces
 * into the method's own zone (`MethodZone.provinces`), so the owner edits the
 * region list afterwards the same way she edits a zone she built by hand.
 *
 * The nine together cover every federal subject exactly once
 * (`__tests__/ru-zone-presets.unit.spec.ts` checks both halves of that).
 */

import { RU_REGIONS, type RuRegion } from "./ru-regions";

export type RuZonePreset = {
  /** Stable key the panel and the API speak; never shown to a buyer. */
  key: string;
  /** What the owner and the buyer read: «Урал», «Москва и область». */
  name: string;
  /** One line under the name in the panel. */
  description: string;
  /** ISO 3166-2:RU codes, as `RU_REGIONS` spells them. */
  region_codes: string[];
};

export const RU_ZONE_PRESETS: RuZonePreset[] = [
  {
    key: "msk",
    name: "Москва и область",
    description: "Москва и Московская область.",
    region_codes: ["RU-MOW", "RU-MOS"],
  },
  {
    key: "spb",
    name: "Санкт-Петербург и область",
    description: "Санкт-Петербург и Ленинградская область.",
    region_codes: ["RU-SPE", "RU-LEN"],
  },
  {
    key: "center",
    name: "Центр",
    description: "Центральный округ без Москвы и области.",
    region_codes: [
      "RU-BEL",
      "RU-BRY",
      "RU-VLA",
      "RU-VOR",
      "RU-IVA",
      "RU-KLU",
      "RU-KOS",
      "RU-KRS",
      "RU-LIP",
      "RU-ORL",
      "RU-RYA",
      "RU-SMO",
      "RU-TAM",
      "RU-TVE",
      "RU-TUL",
      "RU-YAR",
    ],
  },
  {
    key: "northwest",
    name: "Северо-Запад",
    description: "Северо-Западный округ без Санкт-Петербурга и области.",
    region_codes: ["RU-ARK", "RU-VLG", "RU-KGD", "RU-KR", "RU-KO", "RU-MUR", "RU-NEN", "RU-NGR", "RU-PSK"],
  },
  {
    key: "south",
    name: "Юг",
    description: "Южный и Северо-Кавказский округа.",
    region_codes: [
      "RU-AD",
      "RU-AST",
      "RU-VGG",
      "RU-DA",
      "RU-IN",
      "RU-KB",
      "RU-KL",
      "RU-KC",
      "RU-KDA",
      "RU-CR",
      "RU-ROS",
      "RU-SE",
      "RU-SEV",
      "RU-STA",
      "RU-CE",
    ],
  },
  {
    key: "volga",
    name: "Поволжье",
    description: "Приволжский округ.",
    region_codes: [
      "RU-BA",
      "RU-KIR",
      "RU-ME",
      "RU-MO",
      "RU-NIZ",
      "RU-ORE",
      "RU-PNZ",
      "RU-PER",
      "RU-SAM",
      "RU-SAR",
      "RU-TA",
      "RU-UD",
      "RU-ULY",
      "RU-CU",
    ],
  },
  {
    key: "ural",
    name: "Урал",
    description: "Уральский округ.",
    region_codes: ["RU-KGN", "RU-SVE", "RU-TYU", "RU-KHM", "RU-CHE", "RU-YAN"],
  },
  {
    key: "siberia",
    name: "Сибирь",
    description: "Сибирский округ.",
    region_codes: [
      "RU-AL",
      "RU-ALT",
      "RU-IRK",
      "RU-KEM",
      "RU-KYA",
      "RU-NVS",
      "RU-OMS",
      "RU-TOM",
      "RU-TY",
      "RU-KK",
    ],
  },
  {
    key: "fareast",
    name: "Дальний Восток",
    description: "Дальневосточный округ.",
    region_codes: [
      "RU-AMU",
      "RU-BU",
      "RU-YEV",
      "RU-ZAB",
      "RU-KAM",
      "RU-MAG",
      "RU-PRI",
      "RU-SA",
      "RU-SAK",
      "RU-KHA",
      "RU-CHU",
    ],
  },
];

const BY_CODE = new Map<string, RuRegion>(RU_REGIONS.map((region) => [region.code, region]));

/** The regions of a preset, in the order its codes are written. Throws on a code no region carries. */
export const regionsOfPreset = (preset: RuZonePreset): RuRegion[] =>
  preset.region_codes.map((code) => {
    const region = BY_CODE.get(code);
    if (!region) {
      throw new Error(`Unknown region code in preset ${preset.key}: ${code}`);
    }
    return region;
  });

/** The `province` strings a preset's zone is built from — what a buyer's address has to match. */
export const provincesOfPreset = (preset: RuZonePreset): string[] =>
  regionsOfPreset(preset).map((region) => region.province);

export const presetByKey = (key: string): RuZonePreset | null =>
  RU_ZONE_PRESETS.find((preset) => preset.key === key) ?? null;

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && new Set([...a, ...b]).size === a.length;

/** The preset a province list IS, or null when the owner picked her own set of regions. */
export const presetForProvinces = (provinces: string[]): RuZonePreset | null =>
  RU_ZONE_PRESETS.find((preset) => sameSet(provincesOfPreset(preset), provinces)) ?? null;

const COUNTRY_NAME: Record<string, string> = {
  ru: "Россия",
  by: "Беларусь",
  kz: "Казахстан",
  am: "Армения",
  kg: "Киргизия",
  uz: "Узбекистан",
  ge: "Грузия",
  us: "США",
  de: "Германия",
};

const plural = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/**
 * The line a buyer reads next to the price («Зона: Урал») and the owner reads
 * in the panel. A zone that IS a preset takes the preset's name; a hand-built
 * one is named by its size, because a list of 15 regions does not fit a card.
 */
export const zoneLabelFor = (zone: { country_code: string; provinces: string[] } | null): string => {
  if (!zone) {
    return "Все страны магазина";
  }
  const country = COUNTRY_NAME[zone.country_code.toLowerCase()] ?? zone.country_code.toUpperCase();
  if (!zone.provinces.length) {
    return `${country}, вся страна`;
  }
  const preset = presetForProvinces(zone.provinces);
  if (preset) {
    return preset.name;
  }
  const count = zone.provinces.length;
  if (count === 1) {
    const region = RU_REGIONS.find((candidate) => candidate.province === zone.provinces[0]);
    return region ? region.name : zone.provinces[0];
  }
  return `${country}, ${count} ${plural(count, "регион", "региона", "регионов")}`;
};
