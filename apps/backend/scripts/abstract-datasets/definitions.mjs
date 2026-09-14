// The ONE abstract dataset, as DATA (specs/catalog-taxonomy/ABSTRACT-DATASETS.md).
//
// Ivan's decision of 2026-09-12 (GLOSSARY.md §2, the second ruling of the day): ONE starter set
// that fits ANY theme. Per-theme sets are parked in t-2026-09-12-abstract-sets-per-theme. An
// abstract set is the catalog a shop that named no sphere of trade is seeded with: names and
// images of ABSTRACT, FORMLESS or GENERALISED objects — a generalised "product", a generalised
// object standing for a section — never a stock photo of a specific thing.
//
// Because the set is one for every theme, the series is COLOUR-NEUTRAL: matte plaster in chalk
// white, mid grey and graphite on a neutral cyclorama, so it argues with no palette. The light
// and the backdrop are the ONLY things that change between the light-mode frame rendered now
// and the dark-mode twin that t-2026-09-12-mode-image-pairs will order later (GLOSSARY.md §3):
// `MODES` holds both halves, and everything else in the prompt is shared.
//
// build.mjs turns this file into data/profiles/abstract/ (profile.json, catalog/*.json,
// i18n/*.json, design/style-board.md, theme.json); render.mjs turns the same objects into one
// 4x4 grid prompt. One source, so the board, the catalog and the prompt cannot drift.

export const DATASET_ID = "abstract";

export const SIZES = [
  { value: "Small", key: "small", ru: "Маленький", cm: 8 },
  { value: "Medium", key: "medium", ru: "Средний", cm: 12 },
  { value: "Large", key: "large", ru: "Большой", cm: 18 },
];

/** What the series forbids, in every cell (the pilot's list, generalised to formless objects). */
export const NEGATIVE =
  "real logos, brand marks or wordmarks of any kind, legible text, letters or numbers anywhere in the frame, " +
  "any recognisable manufactured product (no phones, bottles, shoes, garments, headphones, cups, jars, furniture), " +
  "human faces, hands or bodies, props, plinths, boxes, tissue paper, plants or foliage, " +
  "coloured or gradient backgrounds, coloured gels, neon or rim-light flare, any colour on the objects, " +
  "wet, glossy or mirrored floor, reflections, a second shadow, a floating subject, top-down flat lay, dutch angle or tilted horizon, " +
  "shallow depth of field, bokeh or motion blur, HDR, oversaturation, heavy vignette or visible upscaling artefacts, " +
  "caption, label, number, grid line, border, drop shadow between panels, collage frame, transparency, checkerboard pattern";

export const GRID_FRAME =
  "The image is a 4 by 4 grid of sixteen separate square photographs, four rows and four columns, of equal size, " +
  "edge to edge with no gutter, no border, no caption and no number. The sixteen panels are identical in exposure, " +
  "white balance, background tone, camera height and subject scale, as if shot in one session on one set.";

/** The objects and the camera: shared by BOTH mode twins, word for word. */
export const OBJECTS =
  "All objects are matte plaster, either chalk white, mid grey or graphite, with no gloss, no colour and no texture beyond a faint chalky grain.";

export const CAMERA =
  "85mm lens at f/8, camera at the height of the object mid-point so each object is seen very slightly from below and reads as solid. " +
  "In every panel the object is centred, fills 70 percent of that panel width, has clear space beneath it, and carries exactly one soft feathered contact shadow directly under it. " +
  "Sharp focus front to back, material texture clearly visible, matte surfaces stay matte.";

/**
 * The mode halves. Only `backdrop` and `light` differ between them — that is the contract the
 * dark twin is generated under. `backdropHex` is the flat tone the cyclorama is asked for and the
 * tone the series gate measures against (it is a target, not a promise: the gate reads the pixels).
 */
export const MODES = {
  light: {
    backdropHex: "#d9d9d9",
    backdrop:
      "Studio still-life photography contact sheet. Every panel shares one identical setup: " +
      "seamless matte light-grey cyclorama background, flat pale neutral grey about one stop below white, a touch lighter at the top, no seam between floor and wall, no horizon.",
    light:
      "One large softbox key at 45 degrees camera-left and 30 degrees above, one white bounce card camera-right for a soft open shadow side, neutral 5600K daylight, no coloured light.",
  },
  dark: {
    backdropHex: "#2e2e2e",
    backdrop:
      "Studio still-life photography contact sheet. Every panel shares one identical setup: " +
      "seamless matte dark-grey cyclorama background, flat deep neutral grey about two stops above black, a touch lighter at the top, no seam between floor and wall, no horizon.",
    light:
      "One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the graphite surfaces, neutral 5600K daylight, no coloured light.",
  },
};

export const STARTER_CLOSING = {
  en: "Part of the starter catalog: swap it for your own product from the panel whenever you are ready.",
  ru: "Часть стартового набора: замените его своим товаром в панели, когда будете готовы.",
};

export const DATASET = {
  id: DATASET_ID,
  /** The preset the set is validated against and seeded with single-store; a tenant's theme comes from its own home document. */
  presetId: "geist",
  defaultMode: "light",
  typography: { display: "Geist", body: "Geist" },
  radius: "md",
  materialEn: "matte plaster in chalk white, mid grey and graphite",
  materialRu: "матовый гипс: меловой белый, средний серый и графитовый",
  weights: [180, 420, 900],
  single: 420,
  roots: [
    {
      handle: "forms", name: { en: "Forms", ru: "Формы" },
      leaves: [
        {
          handle: "spheres", singular: "sphere", name: { en: "Spheres", ru: "Сферы" }, formRu: "Сфера",
          tile: "three matte plaster spheres of three sizes, chalk white, mid grey and graphite, in a loose row",
          products: [
            { finish: { en: "Chalk white", ru: "Меловой белый" }, subject: "a single matte chalk white plaster sphere with a faintly chalky surface", subjectRu: "одиночная матовая мелово-белая гипсовая сфера с едва заметной меловой поверхностью", price: 48, sized: true },
            { finish: { en: "Graphite", ru: "Графит" }, subject: "a single matte graphite plaster sphere with a soft velvet-like surface", subjectRu: "одиночная матовая графитовая гипсовая сфера с мягкой бархатистой поверхностью", price: 52, sized: true },
          ],
        },
        {
          handle: "cubes", singular: "cube", name: { en: "Cubes", ru: "Кубы" }, formRu: "Куб",
          tile: "three matte plaster cubes of three sizes, chalk white, mid grey and graphite, standing flat in a loose row",
          products: [
            { finish: { en: "Chalk white", ru: "Меловой белый" }, subject: "a matte chalk white plaster cube with softly rounded edges, resting flat and turned twenty degrees", subjectRu: "матовый мелово-белый гипсовый куб с мягко скруглёнными рёбрами, стоит на грани, повёрнут на двадцать градусов", price: 44, sized: true },
            { finish: { en: "Mid grey", ru: "Средний серый" }, subject: "a matte mid grey plaster cube with softly rounded edges, resting flat and turned twenty degrees", subjectRu: "матовый серый гипсовый куб с мягко скруглёнными рёбрами, стоит на грани, повёрнут на двадцать градусов", price: 46, sized: false },
          ],
        },
        {
          handle: "cylinders", singular: "cylinder", name: { en: "Cylinders", ru: "Цилиндры" }, formRu: "Цилиндр",
          tile: "three matte plaster cylinders of different heights, chalk white, mid grey and graphite, standing upright in a loose row",
          products: [
            { finish: { en: "Chalk white", ru: "Меловой белый" }, subject: "a short matte chalk white plaster cylinder standing upright", subjectRu: "короткий матовый мелово-белый гипсовый цилиндр, стоящий вертикально", price: 40, sized: true },
            { finish: { en: "Graphite", ru: "Графит" }, subject: "a tall matte graphite plaster cylinder standing upright", subjectRu: "высокий матовый графитовый гипсовый цилиндр, стоящий вертикально", price: 58, sized: false },
          ],
        },
      ],
    },
    {
      handle: "sets", name: { en: "Sets", ru: "Наборы" },
      leaves: [
        {
          handle: "pairs", singular: "pair", name: { en: "Pairs", ru: "Пары" }, formRu: "Пара",
          tile: "two pairs of matte plaster forms, a chalk white sphere with a graphite cube and two mid grey cylinders, spaced apart",
          products: [
            { finish: { en: "White and graphite", ru: "Белый и графит" }, subject: "a matte chalk white plaster sphere beside a matte graphite plaster cube, touching", subjectRu: "матовая мелово-белая гипсовая сфера рядом с матовым графитовым гипсовым кубом, соприкасаются", price: 88, sized: true },
            { finish: { en: "Two greys", ru: "Два серых" }, subject: "two matte mid grey plaster cylinders of different heights standing side by side", subjectRu: "два матовых серых гипсовых цилиндра разной высоты, стоящие рядом", price: 76, sized: false },
          ],
        },
        {
          handle: "stacks", singular: "stack", name: { en: "Stacks", ru: "Стопки" }, formRu: "Стопка",
          tile: "a stack of five matte plaster discs alternating chalk white and graphite, largest at the bottom",
          products: [
            { finish: { en: "Three whites", ru: "Три белых" }, subject: "three matte chalk white plaster discs stacked, the largest at the bottom", subjectRu: "три матовых мелово-белых гипсовых диска, сложенные стопкой, самый большой внизу", price: 96, sized: true },
            { finish: { en: "Graphite on white", ru: "Графит на белом" }, subject: "a small matte graphite plaster cube resting on a larger matte chalk white plaster cube", subjectRu: "маленький матовый графитовый гипсовый куб на большом матовом мелово-белом гипсовом кубе", price: 92, sized: false },
          ],
        },
      ],
    },
  ],
  heroSubject:
    "a wide loose arrangement of seven matte plaster forms, chalk white, mid grey and graphite spheres, cubes and cylinders, spaced apart across the panel",
};

/** Every leaf of the set, in reading order, with its root attached. */
export function leavesOf(set = DATASET) {
  return set.roots.flatMap((root) => root.leaves.map((leaf) => ({ ...leaf, root })));
}

/** The ten products of the set, in reading order, each with handle, title and its leaf. */
export function productsOf(set = DATASET) {
  return leavesOf(set).flatMap((leaf) =>
    leaf.products.map((product, i) => {
      const n = i + 1;
      const form = leaf.singular.charAt(0).toUpperCase() + leaf.singular.slice(1);
      return {
        ...product,
        n,
        leaf,
        handle: `${leaf.singular}-${n}`,
        title: { en: `${form} No. ${n} · ${product.finish.en}`, ru: `${leaf.formRu} № ${n} · ${product.finish.ru}` },
        form,
      };
    }),
  );
}

/** The shared prompt preamble for one mode: backdrop + light (the mode half) + objects (shared). */
export function preambleFor(mode) {
  const m = MODES[mode];
  if (!m) throw new Error(`unknown mode "${mode}", known: ${Object.keys(MODES).join(", ")}`);
  return `${m.backdrop} ${m.light} ${OBJECTS} ${CAMERA}`;
}
