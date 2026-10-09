import type { BpjEdition, BpjSourceProduct } from "../catalog";

/**
 * Six invented products in the shape of the Beauty Pro Japan catalog file: the client's
 * own file never enters the repository. Between them they cover what the real file holds:
 * a priced product with sized variants, a product without a price, a variant without its
 * own price, a product of the English site only, a product without any picture and two
 * editions nothing tells apart.
 */

const edition = (uid: number, price: string | null, options: Record<string, string> = {}, img: string | null = null): BpjEdition => ({
  uid,
  externalid: `ext${uid}`,
  sku: "",
  price,
  priceold: "",
  quantity: "",
  img,
  ...options,
});

const product = (fields: Partial<BpjSourceProduct> & Pick<BpjSourceProduct, "brand" | "editions">): BpjSourceProduct => ({
  source: "RU",
  uid_ru: null,
  uid_en: null,
  title_ru: "",
  title_en: "",
  text_ru: "",
  text_en: "",
  price_jpy: null,
  priceold_jpy: "",
  sku: "",
  gallery: "[]",
  characteristics: [],
  storeparts_ru: [],
  storeparts_en: [],
  ...fields,
});

const gallery = (...names: string[]) => JSON.stringify(names.map((name) => ({ img: `https://static.example.test/${name}.jpg` })));

export const sampleCatalog = (): BpjSourceProduct[] => [
  product({
    uid_ru: 1001,
    title_ru: "Шампунь Утренняя роса",
    title_en: "Morning Dew Shampoo",
    text_ru: "Мягкий шампунь.<br>Для ежедневного ухода.",
    text_en: "A gentle shampoo.",
    price_jpy: "3500.0000",
    gallery: gallery("dew-1", "dew-2"),
    characteristics: [{ title: "Тип", value: "Шампунь" }],
    storeparts_ru: ["11", "11"],
    brand: "Lebel",
    editions: [edition(2001, "3 500.00", { Объем: "250 мл" }, "https://static.example.test/dew-1.jpg"), edition(2002, "9 000.00", { Объем: "1000 мл" })],
  }),
  product({
    uid_ru: 1002,
    title_ru: "Маска Тихий сад",
    text_ru: "Маска для волос.",
    gallery: gallery("garden"),
    storeparts_ru: ["11"],
    brand: "Lebel",
    editions: [edition(2003, null)],
  }),
  product({
    uid_ru: 1003,
    title_ru: "Ножницы Ветер",
    title_en: "Wind Scissors",
    price_jpy: "52000.0000",
    gallery: gallery("wind"),
    storeparts_ru: ["22"],
    brand: "Mizutani",
    editions: [edition(2004, "52 000.00", { Длина: "5.5" }), edition(2005, null, { Длина: "6.0" })],
  }),
  product({
    source: "EN",
    uid_en: 1004,
    title_en: "Bond Oil",
    text_en: "An oil for the ends.",
    price_jpy: "4200.0000",
    gallery: gallery("bond"),
    storeparts_en: ["33"],
    brand: "Olaplex",
    editions: [edition(2006, "4 200.00")],
  }),
  product({
    uid_ru: 1005,
    title_ru: "Расчёска Гребень",
    price_jpy: "7000.0000",
    gallery: gallery("comb"),
    storeparts_ru: ["44"],
    brand: "Tokio",
    editions: [edition(2007, "7 000.00", { Длина: "" }), edition(2008, "7 500.00", { Длина: "" })],
  }),
  product({
    uid_ru: 1006,
    title_ru: "Сыворотка Без фото",
    storeparts_ru: ["44"],
    brand: "Tokio",
    editions: [edition(2009, null)],
  }),
];
