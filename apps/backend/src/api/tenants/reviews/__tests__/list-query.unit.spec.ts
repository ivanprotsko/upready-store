import {
  parseAnsweredFilter,
  parseRatingFilter,
  parseReviewOrder,
  parseSearch,
  parseSourceFilter,
  reviewListWhere,
} from "../list-query";

// t-2026-10-14-01 (panel redesign G5): the narrowing the panel's «Отзывы»
// keeps in its address, read by `GET /tenants/reviews`.

describe("parseRatingFilter", () => {
  it("answers null when not asked", () => {
    expect(parseRatingFilter(undefined)).toBeNull();
    expect(parseRatingFilter("")).toBeNull();
  });

  it("reads one star count or several", () => {
    expect(parseRatingFilter("5")).toEqual([5]);
    expect(parseRatingFilter(["1", "2"])).toEqual([1, 2]);
  });

  it("refuses what is not a whole star from 1 to 5", () => {
    for (const bad of ["0", "6", "4.5", "пять"]) {
      expect(() => parseRatingFilter(bad)).toThrow("'rating' must be a whole number between 1 and 5");
    }
  });
});

describe("parseSourceFilter", () => {
  it("reads the three sources and refuses any other", () => {
    expect(parseSourceFilter(["shop", "wb"])).toEqual(["shop", "wb"]);
    expect(parseSourceFilter(undefined)).toBeNull();
    expect(() => parseSourceFilter("ozon")).toThrow("'source' must be one of shop, imported, wb");
  });
});

describe("parseAnsweredFilter", () => {
  it("reads yes and no", () => {
    expect(parseAnsweredFilter("yes")).toBe(true);
    expect(parseAnsweredFilter("no")).toBe(false);
  });

  it("treats both at once as no narrowing", () => {
    expect(parseAnsweredFilter(["yes", "no"])).toBeNull();
    expect(parseAnsweredFilter(undefined)).toBeNull();
  });

  it("refuses any other word", () => {
    expect(() => parseAnsweredFilter("maybe")).toThrow("'answered' must be yes or no");
  });
});

describe("parseSearch", () => {
  it("trims and drops an empty search", () => {
    expect(parseSearch("  мята ")).toBe("мята");
    expect(parseSearch("   ")).toBeNull();
    expect(parseSearch(undefined)).toBeNull();
  });

  it("escapes the ILIKE wildcards so they match themselves", () => {
    expect(parseSearch("100%_\\")).toBe("100\\%\\_\\\\");
  });

  it("refuses a search longer than 200 characters", () => {
    expect(() => parseSearch("а".repeat(201))).toThrow("'q' must be at most 200 characters");
  });
});

describe("parseReviewOrder", () => {
  it("keeps today's order when none is asked: newest written first", () => {
    expect(parseReviewOrder(undefined)).toEqual({ review_date: "DESC", id: "DESC" });
  });

  it("maps the panel's names to the columns, a leading minus descending", () => {
    expect(parseReviewOrder("rating")).toEqual({ rating: "ASC", id: "ASC" });
    expect(parseReviewOrder("-rating")).toEqual({ rating: "DESC", id: "DESC" });
    expect(parseReviewOrder("written_at")).toEqual({ review_date: "ASC", id: "ASC" });
  });

  it("refuses a column it does not sort by", () => {
    expect(() => parseReviewOrder("body")).toThrow("'order' must be one of written_at, rating");
  });
});

describe("reviewListWhere", () => {
  const none = { ratings: null, sources: null, answered: null, search: null };

  it("adds nothing when nothing narrows", () => {
    expect(reviewListWhere(none)).toEqual({});
  });

  it("narrows by stars, source and answer", () => {
    expect(reviewListWhere({ ...none, ratings: [1, 2], sources: ["shop"], answered: false })).toEqual({
      rating: [1, 2],
      source: ["shop"],
      reply: null,
    });
    expect(reviewListWhere({ ...none, answered: true })).toEqual({ reply: { $ne: null } });
  });

  it("searches the text, the title and the buyer's name", () => {
    expect(reviewListWhere({ ...none, search: "мята" })).toEqual({
      $or: [
        { body: { $ilike: "%мята%" } },
        { title: { $ilike: "%мята%" } },
        { author_name: { $ilike: "%мята%" } },
      ],
    });
  });
});
