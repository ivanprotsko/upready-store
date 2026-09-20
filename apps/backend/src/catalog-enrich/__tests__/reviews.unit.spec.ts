import { reviewsToCreate, WB_REVIEW_LANGUAGE } from "../apply";

/**
 * The review half of w07-tenant-catalog-enrich must be idempotent on WB's own
 * feedback id: a second `--apply` imports nothing, and an edit the owner made
 * on the panel survives it.
 */

const review = (sourceKey: string) => ({ source_key: sourceKey, body: `текст ${sourceKey}` });

describe("catalog-enrich/apply — reviewsToCreate", () => {
  it("imports every review of a product that has none", () => {
    expect(reviewsToCreate([], [review("a"), review("b")])).toHaveLength(2);
  });

  it("imports nothing on a second run: the source key is the identity", () => {
    const existing = [
      { source_key: "a", language: WB_REVIEW_LANGUAGE },
      { source_key: "b", language: WB_REVIEW_LANGUAGE },
    ];

    expect(reviewsToCreate(existing, [review("a"), review("b")])).toEqual([]);
  });

  it("does not overwrite a review the owner edited — it only fills an absence", () => {
    const existing = [{ source_key: "a", language: WB_REVIEW_LANGUAGE }];
    const toCreate = reviewsToCreate(existing, [review("a"), review("b")]);

    expect(toCreate.map((one) => one.source_key)).toEqual(["b"]);
  });

  it("ignores a review the shop's own visitors left, which carries no source key", () => {
    const existing = [{ source_key: null, language: WB_REVIEW_LANGUAGE }];

    expect(reviewsToCreate(existing, [review("a")])).toHaveLength(1);
  });

  it("counts a row of another language as another row, the way the index does", () => {
    const existing = [{ source_key: "a", language: "en" }];

    expect(reviewsToCreate(existing, [review("a")])).toHaveLength(1);
  });

  it("creates one row for a feedback the card lists twice", () => {
    expect(reviewsToCreate([], [review("a"), review("a")]).map((one) => one.source_key)).toEqual(["a"]);
  });
});
