import { toDeskItem, type DeskItem, type DeskKind, type DeskRow, type ProductLink } from "../desk";
import { describeGenerator, generateDraft } from "../draft-generator";
import {
  DEFAULT_REVIEW_SORT,
  countMpReviews,
  resolveMpReviewsQuery,
  selectMpReviews,
  type MpReviewsQuery,
} from "../reviews-list";

/**
 * The rules of «Wildberries → Отзывы» without a database (mp-section-design
 * task-05; the w18 desk's own suite before it).
 *
 * Reviews and questions are ONE list here, so the suite holds the three
 * things that list can get wrong: a question filtered away by a control that
 * cannot apply to it, a count that shrinks with the filter, and the
 * rating-less questions sorted on top of «сначала худшие».
 */

const NO_PRODUCT: ProductLink = {
  vendor_code: null,
  mp_title: null,
  mp_external_id: null,
  product_id: null,
  product_title: null,
  linked: false,
};

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

const item = (
  kind: DeskKind,
  over: Partial<DeskRow> = {},
  product: Partial<ProductLink> = {},
): DeskItem => toDeskItem(row(over), kind, { ...NO_PRODUCT, ...product });

const query = (over: Partial<MpReviewsQuery> = {}): MpReviewsQuery => ({
  q: null,
  kinds: [],
  ratings: [],
  answered: null,
  created_at: null,
  sort: DEFAULT_REVIEW_SORT,
  ...over,
});

const ids = (items: DeskItem[]) => items.map((one) => one.id);

/** Three reviews and two questions, dated one day apart, newest first by id order r1 > q1 > r2 > q2 > r3. */
const ALL: DeskItem[] = [
  item("reviews", { id: "r1", rating: 5, created_at_mp: "2026-09-15T10:00:00.000Z", is_answered: true }),
  item("questions", {
    id: "q1",
    rating: undefined,
    text: undefined,
    question_text: "Есть ли сертификат?",
    author: "Ирина",
    created_at_mp: "2026-09-14T10:00:00.000Z",
  }),
  item(
    "reviews",
    { id: "r2", rating: 1, text: "Пришло мятым", cons: "упаковка", created_at_mp: "2026-09-13T10:00:00.000Z" },
    { mp_title: "Мазь с прополисом" },
  ),
  item("questions", {
    id: "q2",
    rating: undefined,
    text: undefined,
    question_text: "Какой срок годности?",
    created_at_mp: "2026-09-12T10:00:00.000Z",
    is_answered: true,
  }),
  item("reviews", { id: "r3", rating: 3, created_at_mp: null }),
];

describe("one list of reviews and questions", () => {
  it("holds both kinds, newest first, an undated row last", () => {
    const { rows } = selectMpReviews(ALL, query());
    expect(ids(rows)).toEqual(["r1", "q1", "r2", "q2", "r3"]);
    expect(rows.map((one) => one.kind)).toEqual(["reviews", "questions", "reviews", "questions", "reviews"]);
  });

  it("maps a question's text and gives it no rating, pros or cons", () => {
    const question = ALL.find((one) => one.id === "q1") as DeskItem;
    expect(question).toMatchObject({ kind: "questions", rating: null, text: "Есть ли сертификат?", pros: null, cons: null });
  });

  it("counts before the filters, and «без ответа» is the marketplace's flag", () => {
    const filtered = selectMpReviews(ALL, query({ kinds: ["questions"], answered: false }));
    expect(ids(filtered.rows)).toEqual(["q1"]);
    expect(filtered.counts).toEqual({
      reviews: { total: 3, unanswered: 2 },
      questions: { total: 2, unanswered: 1 },
    });
    expect(countMpReviews([])).toEqual({
      reviews: { total: 0, unanswered: 0 },
      questions: { total: 0, unanswered: 0 },
    });
  });

  it("does not read a saved draft as an answer", () => {
    const drafted = item("reviews", { id: "d", answer_draft: "Спасибо!", answer_draft_at: new Date(), is_answered: false });
    expect(ids(selectMpReviews([drafted], query({ answered: false })).rows)).toEqual(["d"]);
    expect(selectMpReviews([drafted], query({ answered: true })).rows).toHaveLength(0);
    expect(countMpReviews([drafted]).reviews.unanswered).toBe(1);
  });
});

describe("filters", () => {
  it("«Тип = Вопросы» keeps the questions alone", () => {
    expect(ids(selectMpReviews(ALL, query({ kinds: ["questions"] })).rows)).toEqual(["q1", "q2"]);
    expect(ids(selectMpReviews(ALL, query({ kinds: ["reviews"] })).rows)).toEqual(["r1", "r2", "r3"]);
  });

  it("a rating narrows the reviews and keeps no question, unless the questions were asked for", () => {
    expect(ids(selectMpReviews(ALL, query({ ratings: [1, 3] })).rows)).toEqual(["r2", "r3"]);
    expect(ids(selectMpReviews(ALL, query({ ratings: [5], kinds: ["questions"] })).rows)).toEqual(["q1", "q2"]);
    expect(ids(selectMpReviews(ALL, query({ ratings: [5], kinds: ["reviews", "questions"] })).rows)).toEqual([
      "r1",
      "q1",
      "q2",
    ]);
  });

  it("a date range drops the undated row", () => {
    const range = { $gte: new Date("2026-09-13T00:00:00.000Z"), $lte: new Date("2026-09-14T23:59:59.999Z") };
    expect(ids(selectMpReviews(ALL, query({ created_at: range })).rows)).toEqual(["q1", "r2"]);
  });

  it("searches the text, the cons, the buyer and the card's title, case-insensitively", () => {
    expect(ids(selectMpReviews(ALL, query({ q: "сертификат" })).rows)).toEqual(["q1"]);
    expect(ids(selectMpReviews(ALL, query({ q: "упаковка" })).rows)).toEqual(["r2"]);
    expect(ids(selectMpReviews(ALL, query({ q: "ирина" })).rows)).toEqual(["q1"]);
    expect(ids(selectMpReviews(ALL, query({ q: "прополис" })).rows)).toEqual(["r2"]);
    expect(selectMpReviews(ALL, query({ q: "нет такого" })).rows).toHaveLength(0);
  });
});

describe("sorting by rating", () => {
  it("puts the questions last in both directions, equal ratings newest first", () => {
    const extra = item("reviews", { id: "r4", rating: 5, created_at_mp: "2026-09-16T10:00:00.000Z" });
    const all = [...ALL, extra];

    expect(ids(selectMpReviews(all, query({ sort: { field: "rating", desc: false } })).rows)).toEqual([
      "r2",
      "r3",
      "r4",
      "r1",
      "q1",
      "q2",
    ]);
    expect(ids(selectMpReviews(all, query({ sort: { field: "rating", desc: true } })).rows)).toEqual([
      "r4",
      "r1",
      "r3",
      "r2",
      "q1",
      "q2",
    ]);
  });

  it("oldest first still keeps the undated row last", () => {
    expect(ids(selectMpReviews(ALL, query({ sort: { field: "created_at", desc: false } })).rows)).toEqual([
      "q2",
      "r2",
      "q1",
      "r1",
      "r3",
    ]);
  });
});

describe("query parsing", () => {
  it("reads the lists the panel writes, and drops what it does not know", () => {
    const parsed = resolveMpReviewsQuery({
      kind: "questions,avito",
      rating: "5,0,9,x,3",
      answered: "no",
      q: "  Мазь ",
      order: "-rating",
    });
    expect(parsed).toMatchObject({
      kinds: ["questions"],
      ratings: [3, 5],
      answered: false,
      q: "мазь",
      sort: { field: "rating", desc: true },
      created_at: null,
    });
  });

  it("treats «yes,no» and nothing alike, and an unknown order as the default", () => {
    expect(resolveMpReviewsQuery({ answered: "yes,no" }).answered).toBeNull();
    expect(resolveMpReviewsQuery({ answered: "yes" }).answered).toBe(true);
    expect(resolveMpReviewsQuery({ answered: "maybe" }).answered).toBeNull();
    expect(resolveMpReviewsQuery({ order: "author" }).sort).toEqual(DEFAULT_REVIEW_SORT);
    expect(resolveMpReviewsQuery({}).sort).toEqual({ field: "created_at", desc: true });
  });

  it("reads the date filter as JSON and answers a broken one with a 400", () => {
    const parsed = resolveMpReviewsQuery({ created_at: JSON.stringify({ $gte: "2026-09-01T00:00:00.000Z" }) });
    expect(parsed.created_at?.$gte?.toISOString()).toBe("2026-09-01T00:00:00.000Z");

    expect(() => resolveMpReviewsQuery({ created_at: "{not-json" })).toThrow(/created_at/);
    expect(() => resolveMpReviewsQuery({ created_at: JSON.stringify({ $eq: "2026-09-01" }) })).toThrow(/\$eq/);
    expect(() => resolveMpReviewsQuery({ created_at: JSON.stringify({ $gte: "вчера" }) })).toThrow(/не дата/);
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
