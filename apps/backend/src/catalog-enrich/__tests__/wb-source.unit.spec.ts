import { attributeKeyFromName } from "../attributes";
import { parseDataset } from "../dataset";
import {
  buyerPrice,
  cardCharacteristics,
  cardPhotos,
  priceCurrency,
  reviewFromFeedback,
  reviewSkipReason,
} from "../wb-source";

/**
 * Reading one WB card as the shop needs it (w07-tenant-catalog-enrich). Every
 * fixture below is a shape measured on the mirror of Oksana's cabinet
 * (2026-09-16), not one invented for the test.
 */

const feedback = (over: Record<string, unknown> = {}) => ({
  feedback_id: "fb1",
  nm_id: "94372564",
  product_valuation: 5,
  text: "Мумиё пришло в хорошем состоянии, будем пробовать.",
  pros: "",
  cons: "",
  user_name: "Нина",
  created_date: "2026-09-14T10:00:00.000Z",
  raw: { answer: null },
  ...over,
});

describe("catalog-enrich/wb-source — characteristics", () => {
  it("reads WB's own shape, where `value` is an array even for one item", () => {
    const rows = cardCharacteristics({
      characteristics: [
        { id: 14177451, name: "Страна производства", value: ["Россия"] },
        { id: 85571, name: "Упаковка", value: ["стеклянная банка"] },
      ],
    });

    expect(rows).toEqual([
      { name: "Страна производства", value: "Россия" },
      { name: "Упаковка", value: "стеклянная банка" },
    ]);
  });

  it("joins a multi-value characteristic instead of dropping all but one", () => {
    const rows = cardCharacteristics({
      characteristics: [{ id: 1, name: "Языки", value: ["русский", "английский"] }],
    });

    expect(rows[0].value).toBe("русский; английский");
  });

  it("drops the paperwork a shopper never reads", () => {
    const rows = cardCharacteristics({
      characteristics: [
        { id: 15001405, name: "Ставка НДС", value: ["5"] },
        { id: 2, name: "ТНВЭД", value: ["1234"] },
        { id: 3, name: "Номер декларации соответствия", value: ["РОСС RU"] },
        { id: 4, name: "Состав", value: ["мумие"] },
      ],
    });

    expect(rows).toEqual([{ name: "Состав", value: "мумие" }]);
  });

  it("gives an empty list for a card with no characteristics rather than throwing", () => {
    expect(cardCharacteristics(null)).toEqual([]);
    expect(cardCharacteristics({})).toEqual([]);
  });
});

describe("catalog-enrich/wb-source — price", () => {
  const row = {
    nm_id: "94372564",
    currency_iso: "RUB",
    discount: 50,
    sizes: [{ price: 1980, sizeID: 150652120, discountedPrice: 990, clubDiscountedPrice: 990 }],
    raw: {},
  };

  it("takes what a WB buyer pays, not the price before the discount", () => {
    expect(buyerPrice(row)).toBe(990);
    expect(priceCurrency(row)).toBe("rub");
  });

  it("takes the lowest of several sizes, the number the listing shows as «от»", () => {
    expect(buyerPrice({ ...row, sizes: [{ discountedPrice: 1200 }, { discountedPrice: 990 }] })).toBe(990);
  });

  it("keeps a fractional price as WB quotes it", () => {
    expect(buyerPrice({ ...row, sizes: [{ discountedPrice: 1109.5 }] })).toBe(1109.5);
  });

  it("gives null rather than zero when the mirror has no price", () => {
    expect(buyerPrice(null)).toBeNull();
    expect(buyerPrice({ ...row, sizes: [] })).toBeNull();
    expect(buyerPrice({ ...row, sizes: [{ discountedPrice: 0 }] })).toBeNull();
  });
});

describe("catalog-enrich/wb-source — photos", () => {
  it("takes `big`, the largest size that answers", () => {
    const photos = cardPhotos([
      {
        big: "https://basket-05.wbbasket.ru/vol943/part94372/94372564/images/big/1.webp",
        c516x688: "https://basket-05.wbbasket.ru/vol943/part94372/94372564/images/c516x688/1.webp",
      },
    ]);

    expect(photos).toEqual([
      { index: 1, url: "https://basket-05.wbbasket.ru/vol943/part94372/94372564/images/big/1.webp" },
    ]);
  });

  it("numbers the photos from one, in the card's own order", () => {
    const photos = cardPhotos([
      { big: "https://basket-05.wbbasket.ru/a/images/big/1.webp" },
      { big: "https://basket-05.wbbasket.ru/a/images/big/2.webp" },
    ]);

    expect(photos.map((one) => one.index)).toEqual([1, 2]);
  });

  it("gives an empty list for a card with no photos", () => {
    expect(cardPhotos(null)).toEqual([]);
  });
});

describe("catalog-enrich/wb-source — reviews", () => {
  it("carries the author, the rating, the text and the date", () => {
    expect(reviewFromFeedback(feedback())).toMatchObject({
      source_key: "fb1",
      author_name: "Нина",
      rating: 5,
      body: "Мумиё пришло в хорошем состоянии, будем пробовать.",
      reply: null,
    });
  });

  it("builds a body out of pros and cons when the buyer wrote no free text", () => {
    const review = reviewFromFeedback(feedback({ text: "", pros: "быстро", cons: "запах" }));
    expect(review?.body).toBe("Достоинства: быстро\n\nНедостатки: запах");
  });

  it("gives null for a rating with no text at all, rather than an empty review", () => {
    expect(reviewFromFeedback(feedback({ text: "", pros: "", cons: "" }))).toBeNull();
  });

  it("names a nameless buyer rather than writing an empty author", () => {
    expect(reviewFromFeedback(feedback({ user_name: "" }))?.author_name).toBe("Покупатель Wildberries");
  });

  it("carries the seller's answer when the card has one", () => {
    const review = reviewFromFeedback(feedback({ raw: { answer: { text: "Спасибо за отзыв!" } } }));
    expect(review?.reply).toBe("Спасибо за отзыв!");
  });

  it("clamps a rating outside WB's own 1..5 instead of failing the whole import", () => {
    expect(reviewFromFeedback(feedback({ product_valuation: 9 }))?.rating).toBe(5);
    expect(reviewFromFeedback(feedback({ product_valuation: 0 }))?.rating).toBe(1);
  });

  it("does NOT invent a star for a feedback with no rating", () => {
    expect(reviewFromFeedback(feedback({ product_valuation: null }))).toBeNull();
    expect(reviewSkipReason(feedback({ product_valuation: null }))).toBe("no_rating");
  });

  it("names the two reasons a feedback is skipped apart", () => {
    expect(reviewSkipReason(feedback())).toBeNull();
    expect(reviewSkipReason(feedback({ text: "", pros: "", cons: "" }))).toBe("no_text");
  });
});

describe("catalog-enrich/attributes — key from a Russian name", () => {
  it("transliterates with the repository's own codec", () => {
    expect(attributeKeyFromName("Страна производства")).toBe("strana_proizvodstva");
    expect(attributeKeyFromName("Объем (мл)")).toBe("obem_ml");
    expect(attributeKeyFromName("Количество предметов в упаковке (шт.)")).toBe(
      "kolichestvo_predmetov_v_upakovke_sht",
    );
  });

  it("gives the same key for the same name, so an import creates no twin", () => {
    expect(attributeKeyFromName("Форма выпуска")).toBe(attributeKeyFromName(" Форма  выпуска "));
  });

  it("gives null for a name no key can be built from", () => {
    expect(attributeKeyFromName("🙂")).toBeNull();
    expect(attributeKeyFromName("")).toBeNull();
  });
});

describe("catalog-enrich/dataset — parseDataset", () => {
  const good = {
    version: 1,
    generated_at: "2026-09-16T00:00:00.000Z",
    tenant_handle: "cherkashino",
    marketplace: "wb",
    source: { cards: 1, prices: 1, feedbacks: 0, mirror_fetched_at: null },
    products: [{ product_handle: "mumie" }],
    unmatched_products: [],
    unmatched_cards: 0,
  };

  it("accepts a dataset this script wrote", () => {
    expect(parseDataset(good)).toMatchObject({ ok: true });
  });

  it("refuses a version it does not understand, naming both numbers", () => {
    const result = parseDataset({ ...good, version: 2 });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toContain("2");
  });

  it("refuses a product without a handle, before the first write", () => {
    expect(parseDataset({ ...good, products: [{ nm_id: "1" }] })).toMatchObject({ ok: false });
  });

  it("refuses anything that is not a dataset", () => {
    expect(parseDataset(null)).toMatchObject({ ok: false });
    expect(parseDataset({ version: 1, marketplace: "ozon" })).toMatchObject({ ok: false });
  });
});
