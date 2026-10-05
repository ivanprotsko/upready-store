import { COURSE_PAGES_EN } from "../course-content/course-pages-en";
import { COURSE_PAGES, type CoursePageLists } from "../course-content/course-pages";

/**
 * N10 (t-2026-10-04-19): the English course landings must mirror the Russian
 * ones they translate, or cherkashino.com/en shows a section, a question or a
 * bullet fewer than /ru, or a Russian word inside the English text. The
 * storefront falls back to the Russian list only when the English one is
 * missing or empty, so a short English list would never be noticed there.
 */

const CYRILLIC = /[А-Яа-яЁё]/;

/** The markdown shape of a text: bullets, numbered items, quotes, bold runs, paragraphs. */
const shape = (text: string) => ({
  bullets: text.match(/^\s*-\s*\S/gm)?.length ?? 0,
  numbered: text.match(/^\s*\d+\.\s/gm)?.length ?? 0,
  quotes: text.match(/^>\s/gm)?.length ?? 0,
  bold: text.match(/\*\*/g)?.length ?? 0,
  paragraphs: text.split(/\n\s*\n/).length,
});

const strings = (lists: CoursePageLists): string[] => [
  ...lists.about.flatMap((entry) => [entry.heading, entry.body]),
  ...lists.faq.flatMap((entry) => [entry.q, entry.a]),
  ...lists.testimonials.flatMap((entry) => [entry.author, entry.text]),
];

describe("course landings in English", () => {
  const translated = Object.keys(COURSE_PAGES_EN);

  it("covers the two landings sold on cherkashino.com", () => {
    expect(translated.sort()).toEqual(["limfa", "ochishenie"]);
  });

  it.each(translated)("%s: reaches the product under course_page.i18n.en, the Russian base untouched", (key) => {
    const page = COURSE_PAGES[key].course_page;
    expect(page.i18n?.en).toBe(COURSE_PAGES_EN[key]);
    expect(Object.keys(page.i18n ?? {})).toEqual(["en"]);
    expect(CYRILLIC.test(page.about[0].heading)).toBe(true);
  });

  it.each(translated)("%s: the same entries in the same order as the Russian", (key) => {
    const russian = COURSE_PAGES[key].course_page;
    const english = COURSE_PAGES_EN[key];

    expect(english.about).toHaveLength(russian.about.length);
    expect(english.faq).toHaveLength(russian.faq.length);
    expect(english.testimonials).toHaveLength(russian.testimonials.length);
    expect(english.testimonials.map((entry) => entry.source)).toEqual(
      russian.testimonials.map((entry) => entry.source),
    );

    english.about.forEach((entry, i) => expect(shape(entry.body)).toEqual(shape(russian.about[i].body)));
    english.faq.forEach((entry, i) => expect(shape(entry.a)).toEqual(shape(russian.faq[i].a)));
  });

  it.each(translated)("%s: every text is filled in and holds no Russian", (key) => {
    for (const text of strings(COURSE_PAGES_EN[key])) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toMatch(CYRILLIC);
    }
  });

  it("leaves a landing without a translation exactly as it was", () => {
    expect(COURSE_PAGES.pochki.course_page.i18n).toBeUndefined();
  });
});
