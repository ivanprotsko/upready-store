/**
 * Review → product rules for the Cherkashina import (t09-reviews).
 *
 * The reviews the client brought over name their product the way the
 * marketplace she sold on did («Асд свечи фракция АСД-2, 2 банки - 20 шт»),
 * not by handle, so the import has to read that string. The old shop did the
 * same with a fuzzy keyword matcher
 * (`chrxnasdmds/apps/storefront/src/lib/data/reviews.ts`), and that matcher
 * both missed 48 of the 166 reviews and attached every «мумиё» review to the
 * mumijo SHAMPOO as well as to the two mumijo products — a review about a
 * 100 g jar rendered under a shampoo.
 *
 * So the rules here name their target product EXPLICITLY, by the handle the
 * product had in the old shop, and the import maps that handle to the new
 * product id through the migration registry
 * (`02-mapping-registry.json`, rows of kind `product`). 53 distinct product
 * names against 38 products is a list a human can read, and a wrong line is
 * then a wrong line rather than a keyword that silently widened.
 *
 * `handles: []` is a name this shop does not sell (hair oil, a hand sanitiser,
 * an assorted honey box). It is a RULE and not a gap: the import reports those
 * reviews as «recognised, no product here» instead of leaving them in the same
 * bucket as a name nobody has read yet.
 *
 * Order matters, first match wins.
 */
export type ReviewProductRule = {
  pattern: RegExp;
  /** Handles in the SOURCE shop; empty means the shop does not sell it. */
  handles: string[];
  /** Printed next to the review in the import report. */
  reason: string;
};

export const CHERKASHINA_REVIEW_RULES: ReviewProductRule[] = [
  {
    // Honey (plain, with mumijo, or an assorted box). Stands before the mumijo
    // rules on purpose: «Мед натуральный с мумие для массажа» is honey.
    pattern: /\bм[ёе]д\b|\bм[ёе]да\b|м[ёе]д\s+(ассорти|натуральный)/i,
    handles: [],
    reason: "мёд (ассорти / с мумиё) — такой позиции в этом магазине нет",
  },
  {
    pattern: /масло\s+для\s+волос/i,
    handles: [],
    reason: "масло для волос поставщика — в этом магазине не продаётся",
  },
  {
    pattern: /санитайзер/i,
    handles: [],
    reason: "санитайзер — в этом магазине не продаётся",
  },
  {
    pattern: /мультиварк/i,
    handles: ["multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt"],
    reason: "мультиварка",
  },
  {
    // Suppositories of every spelling: «Асд свечи…», «Фитосвечи АСД…»,
    // «Свечи с касторовым маслом и Антисептик Стимулятор Д2».
    pattern: /свеч[а-яё]*[^;]*(асд|acd|дорогов|антисептик|д-?2|касторов)/i,
    handles: ["svechi-asd-s-chesnokom-10-sht"],
    reason: "свечи с АСД",
  },
  {
    // The shop sells exactly one ASD ointment, so «Мазь 50 мл с АСД» and
    // «Мазь с АСД 3 15%» are the same product.
    pattern: /мазь[^;]*(асд|дорогов)/i,
    handles: ["maz-s-asd-3-15-100-ml"],
    reason: "мазь с АСД-3",
  },
  {
    pattern: /таблетк[а-яё]*[^;]*(асд|антисептик|дорогов)|(?:антисептик|стимулятор|дорогов)[^;]*таблетк/i,
    handles: ["antiseptikom-stumulyatorom-dorogova-tabletki-60-shtuk"],
    reason: "таблетки Антисептик-стимулятор Дорогова",
  },
  {
    // «АДФ» in one review is the author's typo for АСД.
    pattern: /капсул[а-яё]*[^;]*(асд|адф|антисептик|дорогов|д-?2)|(?:антисептик|стимулятор|дорогов|асд)[^;]*капсул/i,
    handles: ["kapsuly-s-asd-fraktsiya-2-dorogova-30-sht"],
    reason: "капсулы с АСД",
  },
  {
    // The liquid fraction, sold by the bottle: «Антисептик стимулятор Д2,
    // 2 флакона по 100 мл». Stands after the four dosage forms above so a
    // «100 мл» ointment is not read as a bottle of the fraction.
    pattern: /(антисептик|стимулятор|дорогов|асд)[^;]*(флакон|\d+\s*мл)/i,
    handles: ["asd-2-fraktsiya-armavir-dorogova"],
    reason: "АСД-2 фракция во флаконах",
  },
  {
    pattern: /касторов/i,
    handles: ["kastorovoe-maslo-kastorka-indiyskaya"],
    reason: "касторовое масло",
  },
  {
    pattern: /мум[ии]е?\s*бальзам|бальзам\s+горного/i,
    handles: ["mumie-balzam-gornogo-altaya-100-gramm"],
    reason: "мумиё «Бальзам Горного Алтая»",
  },
  {
    pattern: /мум[ьи]?[её][^;]*алтайск|алтайск[^;]*мум[ьи]?[её]/i,
    handles: ["mumie-altayskoe-ochischennoe-naturalnoe-100"],
    reason: "мумиё алтайское очищенное",
  },
  {
    pattern: /стеви/i,
    handles: ["steviya-v-tabletkah-saharozamenitel-100-sht"],
    reason: "стевия в таблетках",
  },
  {
    pattern: /тройчатк/i,
    handles: ["troychatka-plyus-60-kapsul"],
    reason: "тройчатка плюс",
  },
  {
    pattern: /сорбент/i,
    handles: ["naturalnyy-sorbent-ot-otravleniy-ot-temperatury"],
    reason: "натуральный сорбент",
  },
];

export type RuleHit = {
  handles: string[];
  reason: string;
};

/**
 * The rule for a review's product name, or null when no rule has read that
 * name yet. Null and `{ handles: [] }` are different answers on purpose: the
 * first is «nobody decided», the second is «decided, this shop does not sell
 * it», and the import report keeps them apart.
 */
export const matchReviewProduct = (productName: unknown): RuleHit | null => {
  if (typeof productName !== "string" || !productName.trim()) {
    return null;
  }
  const rule = CHERKASHINA_REVIEW_RULES.find((entry) => entry.pattern.test(productName));
  return rule ? { handles: rule.handles, reason: rule.reason } : null;
};
