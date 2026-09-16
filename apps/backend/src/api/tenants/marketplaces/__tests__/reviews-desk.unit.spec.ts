import {
  ANSWERED_VALUES,
  appliedFilters,
  filterRows,
  parseDeskFilters,
  type DeskFilters,
  type DeskRow,
} from "../desk";
import { describeGenerator, generateDraft } from "../../../../modules/marketplace/draft-generator";

/**
 * The desk's own rules, without a database (w18-mp-reviews-desk).
 *
 * The filters are a pure function on purpose: the rows on the screen and the
 * numbers in the tab labels are produced by the SAME call, so a suite that
 * holds the function holds both. A second condition written by hand for the
 * counts is exactly how a screen starts disagreeing with itself.
 */

const NOW = new Date("2026-09-16T09:00:00.000Z");

const row = (over: Partial<DeskRow> = {}): DeskRow => ({
  id: "mprev_1",
  marketplace: "wb",
  external_id: "f-1",
  vendor_code: "ART-1",
  rating: 5,
  text: "Хороший товар",
  pros: null,
  cons: null,
  author: "Оксана",
  created_at_mp: new Date("2026-09-15T10:00:00.000Z"),
  is_answered: false,
  answer_draft: null,
  answer_draft_at: null,
  ...over,
});

const filters = (over: Partial<DeskFilters> = {}): DeskFilters => ({
  marketplace: null,
  rating: null,
  answered: "all",
  period: "all",
  limit: 50,
  offset: 0,
  ...over,
});

describe("desk filters", () => {
  it("keeps everything when nothing is set", () => {
    const rows = [row(), row({ id: "2", marketplace: "ozon", is_answered: true })];
    expect(filterRows(rows, filters(), NOW)).toHaveLength(2);
  });

  it("narrows by marketplace", () => {
    const rows = [row(), row({ id: "2", marketplace: "ozon" })];
    expect(filterRows(rows, filters({ marketplace: "ozon" }), NOW).map((one) => one.id)).toEqual([
      "2",
    ]);
  });

  it("«без ответа» keeps exactly the rows the marketplace reports as unanswered", () => {
    const rows = [row({ is_answered: true }), row({ id: "2", is_answered: false })];
    expect(filterRows(rows, filters({ answered: "no" }), NOW).map((one) => one.id)).toEqual(["2"]);
    expect(filterRows(rows, filters({ answered: "yes" }), NOW).map((one) => one.id)).toEqual([
      "mprev_1",
    ]);
  });

  it("does not read a saved draft as an answer", () => {
    /**
     * A draft lives in our database and says nothing about the marketplace.
     * Treating it as an answer would empty the «без ответа» filter of exactly
     * the rows that still need one over there (rule 20a).
     */
    const rows = [row({ answer_draft: "Спасибо!", answer_draft_at: new Date(), is_answered: false })];
    expect(filterRows(rows, filters({ answered: "no" }), NOW)).toHaveLength(1);
  });

  it("narrows by rating, exactly", () => {
    const rows = [row({ rating: 5 }), row({ id: "2", rating: 4 }), row({ id: "3", rating: null })];
    expect(filterRows(rows, filters({ rating: 4 }), NOW).map((one) => one.id)).toEqual(["2"]);
  });

  it("a bounded period drops a row the marketplace gave no date for, «за всё время» keeps it", () => {
    const rows = [
      row({ created_at_mp: new Date("2026-09-15T10:00:00.000Z") }),
      row({ id: "old", created_at_mp: new Date("2026-06-01T10:00:00.000Z") }),
      row({ id: "undated", created_at_mp: null }),
    ];
    expect(filterRows(rows, filters({ period: "30d" }), NOW).map((one) => one.id)).toEqual([
      "mprev_1",
    ]);
    expect(filterRows(rows, filters({ period: "all" }), NOW)).toHaveLength(3);
  });
});

describe("query parsing", () => {
  it("drops a marketplace no adapter is registered for", () => {
    expect(parseDeskFilters({ marketplace: "avito" }).marketplace).toBeNull();
    expect(parseDeskFilters({ marketplace: "wb" }).marketplace).toBe("wb");
  });

  it("drops a rating outside 1..5 and an unknown period", () => {
    expect(parseDeskFilters({ rating: "9" }).rating).toBeNull();
    expect(parseDeskFilters({ rating: "0" }).rating).toBeNull();
    expect(parseDeskFilters({ rating: "3" }).rating).toBe(3);
    expect(parseDeskFilters({ period: "вчера" }).period).toBe("all");
    expect(parseDeskFilters({ period: "7d" }).period).toBe("7d");
  });

  it("knows only the three answered values", () => {
    for (const value of ANSWERED_VALUES) {
      expect(parseDeskFilters({ answered: value }).answered).toBe(value);
    }
    expect(parseDeskFilters({ answered: "maybe" }).answered).toBe("all");
  });

  it("caps the page size", () => {
    expect(parseDeskFilters({ limit: "10000" }).limit).toBe(200);
    expect(parseDeskFilters({ limit: "-1" }).limit).toBe(50);
  });

  it("names the filters that were actually applied, so an empty list can say why", () => {
    expect(appliedFilters(filters({ marketplace: "wb", answered: "no", period: "30d" }))).toEqual([
      { field: "marketplace", value: "wb" },
      { field: "answered", value: "no" },
      { field: "period", value: "30d" },
    ]);
    expect(appliedFilters(filters())).toEqual([]);
  });
});

describe("the draft generator", () => {
  it("is off until it is switched on, and says so", () => {
    const off = describeGenerator({});
    expect(off.available).toBe(false);
    expect(off.reason).toContain("MP_DRAFT_GENERATOR");
  });

  it("does not treat a typo as «off»", () => {
    const wrong = describeGenerator({ MP_DRAFT_GENERATOR: "gpt" });
    expect(wrong.available).toBe(false);
    expect(wrong.reason).toContain("gpt");
    expect(wrong.reason).toContain("template");
  });

  it("is available, and local, with the template", () => {
    const on = describeGenerator({ MP_DRAFT_GENERATOR: "template" });
    expect(on.available).toBe(true);
    expect(on.id).toBe("template");
    expect(on.remote).toBe(false);
  });

  it("leaves a marked gap instead of inventing a fact about the shop", () => {
    const draft = generateDraft({
      kind: "reviews",
      rating: 2,
      text: "Пришло мятым",
      pros: null,
      cons: "мятая упаковка",
      author: "Мария",
      product_title: "Платье",
    });
    expect(draft).toContain("Мария");
    expect(draft).toContain("Платье");
    expect(draft).toContain("мятая упаковка");
    expect(draft).toContain("[");
  });

  it("greets a review with no author without an empty name", () => {
    const draft = generateDraft({
      kind: "reviews",
      rating: 5,
      text: "Отлично",
      pros: null,
      cons: null,
      author: null,
      product_title: null,
    });
    expect(draft.startsWith("Здравствуйте!")).toBe(true);
    expect(draft).not.toContain("undefined");
    expect(draft).not.toContain("null");
  });
});
