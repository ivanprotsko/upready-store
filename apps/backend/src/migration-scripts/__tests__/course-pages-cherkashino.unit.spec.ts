import { COURSE_PAGES } from "../../scripts/course-content/course-pages";
import {
  KIDNEYS,
  LYMPH_DESCRIPTION_BEFORE,
  VARICOSE,
  VARICOSE_HREF,
  collectionEdit,
  pageContentEdit,
  varicoseBannerEdit,
} from "../data/course-pages-cherkashino";

// t-2026-10-13-26: the texts and links are the ones cherkashino.ru showed on 13.10 (Store API
// with the shop's public key, `tenant_home_config` of the shop); there is nothing personal.

/** The list items of a markdown text, without their markers. */
const items = (text: string) =>
  text
    .split("\n")
    .filter((line) => /^\s*-\s+/.test(line))
    .map((line) => line.replace(/^\s*-\s+/, "").trim());

describe("the lymph landing", () => {
  const lymph = COURSE_PAGES.limfa;

  it("no longer repeats the first section's list in the description", () => {
    const firstSection = items(lymph.course_page.about[0].body);
    expect(firstSection).toHaveLength(6);
    expect(items(LYMPH_DESCRIPTION_BEFORE)).toEqual(firstSection);
    expect(items(lymph.description)).toEqual([]);
    expect(lymph.description).not.toContain("Удалить токсины");
  });

  it("keeps the landing's sections in its order, the two days under «Что включает курс?»", () => {
    expect(lymph.course_page.about.map((section) => section.heading)).toEqual([
      "Почему очищение лимфы важно?",
      "Что включает курс?",
      "Результат, который вы получите",
      "Формат участия",
    ]);
    expect(lymph.course_page.faq).toHaveLength(17);
  });

  it("is written over the description of 2026-10-02 and over none, never over the owner's own", () => {
    const before = { description: LYMPH_DESCRIPTION_BEFORE, course_page: { about: [], faq: [] } };
    expect(pageContentEdit(before, lymph, [LYMPH_DESCRIPTION_BEFORE])).toBe("write");
    expect(pageContentEdit({ description: "", course_page: null }, lymph)).toBe("write");
    expect(pageContentEdit({ description: "Свой текст владельца", course_page: null }, lymph, [LYMPH_DESCRIPTION_BEFORE])).toBe(
      "different",
    );
    expect(
      pageContentEdit({ description: lymph.description, course_page: JSON.parse(JSON.stringify(lymph.course_page)) }, lymph),
    ).toBe("already");
  });
});

describe("the kidneys landing", () => {
  const kidneys = COURSE_PAGES.pochki;

  it("is laid out like the liver course: the first screen, then the programme and the author", () => {
    expect(kidneys.source_url).toBe("https://cherkashinaoks.ru/pochki");
    expect(kidneys.description.startsWith("Восстанавливаем почки")).toBe(true);
    expect(kidneys.description).not.toMatch(/Старт/);
    expect(kidneys.course_page.about.map((section) => section.heading)).toEqual(["Программа курса", "Об авторе"]);
    expect(items(kidneys.course_page.about[0].body)).toHaveLength(4);
  });

  it("is a draft course at the landing's current price, sold with full access", () => {
    expect(KIDNEYS).toMatchObject({
      handle: "course-ochishchenie-pochek-cherkashino",
      option_title: "Доступ",
      option_value: "Полный курс",
      price_rub: 5000,
    });
  });
});

describe("collectionEdit", () => {
  it("puts a product without a collection in, and leaves one in another collection there", () => {
    expect(collectionEdit(null, "pcol_1")).toBe("set");
    expect(collectionEdit(undefined, "pcol_1")).toBe("set");
    expect(collectionEdit("pcol_1", "pcol_1")).toBe("already");
    expect(collectionEdit("pcol_2", "pcol_1")).toBe("other");
  });
});

describe("varicoseBannerEdit", () => {
  const liver = { id: "chistka-pecheni", link: { type: "url", href: "/products/course-ochishchenie-pecheni-cherkashino" } };
  const varicose = { id: VARICOSE.banner_id, title: "Товары от\nварикоза", link: { type: "url", href: "/ru/store" } };

  it("points the banner that leads to the catalogue at the collection, the others untouched", () => {
    const edit = varicoseBannerEdit([liver, varicose]);
    expect(edit.outcome).toBe("changed");
    expect(edit.banners).toEqual([liver, { ...varicose, link: { type: "url", href: VARICOSE_HREF } }]);
    expect(VARICOSE_HREF).toBe("/collections/tovary-ot-varikoza-cherkashino");
  });

  it("leaves a banner the owner pointed elsewhere, and one already pointed", () => {
    const own = { ...varicose, link: { type: "url", href: "/categories/asd-cherkashino" } };
    expect(varicoseBannerEdit([own]).outcome).toBe("different");
    expect(varicoseBannerEdit([{ ...varicose, link: { type: "product", product_id: "prod_1" } }]).outcome).toBe(
      "different",
    );
    expect(varicoseBannerEdit([{ ...varicose, link: { type: "url", href: VARICOSE_HREF } }]).outcome).toBe("already");
    expect(varicoseBannerEdit([liver]).outcome).toBe("missing");
  });
});
