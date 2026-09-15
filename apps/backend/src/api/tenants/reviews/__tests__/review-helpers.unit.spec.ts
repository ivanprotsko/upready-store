import {
  pickReviewsForLocale,
  reviewGroupKey,
  sortReviewsNewestFirst,
  summarizeReviews,
  type ReviewRow,
} from "../review-helpers";

const row = (overrides: Partial<ReviewRow> & { id: string }): ReviewRow => ({
  tenant_id: "ten_1",
  product_id: "prod_1",
  author_name: "Анна",
  rating: 5,
  title: null,
  body: "Текст",
  language: "ru",
  status: "published",
  source: "imported",
  customer_id: null,
  order_id: null,
  reply: null,
  replied_at: null,
  review_date: "2026-01-01T00:00:00.000Z",
  source_key: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("summarizeReviews", () => {
  it("answers null for an empty set instead of 0 or 5", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: null });
  });

  it("averages to one decimal", () => {
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      count: 3,
      average: 4.3,
    });
  });

  it("keeps a whole average whole", () => {
    expect(summarizeReviews([{ rating: 5 }, { rating: 5 }])).toEqual({ count: 2, average: 5 });
  });
});

describe("pickReviewsForLocale", () => {
  const ru = row({ id: "prev_ru", language: "ru", source_key: "chrxn:1", body: "русский" });
  const en = row({ id: "prev_en", language: "en", source_key: "chrxn:1", body: "english" });

  it("counts a translated review once, not twice", () => {
    expect(pickReviewsForLocale([ru, en], "ru")).toHaveLength(1);
    expect(summarizeReviews(pickReviewsForLocale([ru, en], "ru"))).toEqual({
      count: 1,
      average: 5,
    });
  });

  it("picks the visitor's language", () => {
    expect(pickReviewsForLocale([ru, en], "en")[0].body).toBe("english");
    expect(pickReviewsForLocale([ru, en], "ru")[0].body).toBe("русский");
  });

  it("falls back to the language part of a regional tag", () => {
    expect(pickReviewsForLocale([ru, en], "en-GB")[0].body).toBe("english");
  });

  it("falls back to whatever language exists, stably", () => {
    expect(pickReviewsForLocale([ru], "de")[0].body).toBe("русский");
    expect(pickReviewsForLocale([ru, en], "de")[0].language).toBe("en");
  });

  it("keeps two untranslated reviews apart", () => {
    const a = row({ id: "prev_a", source_key: null });
    const b = row({ id: "prev_b", source_key: null });
    expect(pickReviewsForLocale([a, b], "ru")).toHaveLength(2);
  });
});

describe("reviewGroupKey", () => {
  it("groups by source_key when there is one, by id otherwise", () => {
    expect(reviewGroupKey({ id: "prev_1", source_key: "chrxn:7" })).toBe("chrxn:7");
    expect(reviewGroupKey({ id: "prev_1", source_key: null })).toBe("prev_1");
  });
});

describe("sortReviewsNewestFirst", () => {
  it("orders by the date the review was written, not the date it was copied", () => {
    const older = row({
      id: "prev_old",
      review_date: "2025-05-01T00:00:00.000Z",
      created_at: "2026-09-15T00:00:00.000Z",
    });
    const newer = row({
      id: "prev_new",
      review_date: "2026-04-11T00:00:00.000Z",
      created_at: "2026-09-15T00:00:00.000Z",
    });
    expect(sortReviewsNewestFirst([older, newer]).map((r) => r.id)).toEqual([
      "prev_new",
      "prev_old",
    ]);
  });

  it("puts a review with no readable date last, not first", () => {
    const dated = row({ id: "prev_dated", review_date: "2024-01-01T00:00:00.000Z" })
    const undated = row({
      id: "prev_undated",
      review_date: null,
      created_at: "2026-09-15T00:00:00.000Z",
    });
    expect(sortReviewsNewestFirst([undated, dated]).map((r) => r.id)).toEqual([
      "prev_dated",
      "prev_undated",
    ]);
  });

  it("breaks a tie by id so two requests agree", () => {
    const a = row({ id: "prev_a" });
    const b = row({ id: "prev_b" });
    expect(sortReviewsNewestFirst([b, a]).map((r) => r.id)).toEqual(["prev_a", "prev_b"]);
  });
});
