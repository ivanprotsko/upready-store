import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCoursePageUpdate, buildCoverMetadata, type CoursePageData } from "./o26-course-page-payload";

const data = JSON.parse(
  readFileSync(join(__dirname, "data/course-ochishchenie-pecheni.json"), "utf8"),
) as CoursePageData;

const BASE = "http://localhost:9241/static";
const bare = { id: "prod_1", description: "old", thumbnail: null, images: [], metadata: { digital: "true" } };

describe("o26 course page payload", () => {
  it("points thumbnail, first image and cover.src at the 1440 variant", () => {
    const { update } = buildCoursePageUpdate(bare, data, BASE);
    const expected = `${BASE}/courses/course-ochishchenie-pecheni/liver-1440.webp`;
    expect(update.thumbnail).toBe(expected);
    expect(update.images[0].url).toBe(expected);
    expect((update.metadata.cover as { src: string }).src).toBe(expected);
  });

  it("lists every variant in srcset, narrowest first, with the src's own size", () => {
    const cover = buildCoverMetadata(data, `${BASE}/`);
    expect(cover.srcset.map((entry) => entry.w)).toEqual([480, 768, 1080, 1440, 1920]);
    expect(cover.srcset[0].url).toBe(`${BASE}/courses/course-ochishchenie-pecheni/liver-480.webp`);
    expect([cover.width, cover.height]).toEqual([1440, 804]);
  });

  it("keeps other metadata keys and the product's other images", () => {
    const { update } = buildCoursePageUpdate(
      { ...bare, images: [{ url: "http://x/other.jpg" }] },
      data,
      BASE,
    );
    expect(update.metadata.digital).toBe("true");
    expect(update.images.map((image) => image.url)).toEqual([update.thumbnail, "http://x/other.jpg"]);
  });

  it("reports every field on a bare product and nothing on a product already written", () => {
    const first = buildCoursePageUpdate(bare, data, BASE);
    expect(first.changes).toEqual(["description", "thumbnail", "images", "metadata.cover", "metadata.course_page"]);

    // What the database hands back: jsonb reorders keys, which must not count as a change.
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reverseKeys(inner)]))
          : value;
    const onFile = {
      id: "prod_1",
      ...first.update,
      metadata: reverseKeys(first.update.metadata) as Record<string, unknown>,
    };
    expect(buildCoursePageUpdate(onFile, data, BASE).changes).toEqual([]);
  });

  it("replaces a cover written under another base URL instead of adding a second one", () => {
    const stand = buildCoursePageUpdate(bare, data, "http://localhost:9121/static").update;
    const { update, changes } = buildCoursePageUpdate({ id: "prod_1", ...stand }, data, "https://api.example/static");
    expect(update.images).toEqual([{ url: "https://api.example/static/courses/course-ochishchenie-pecheni/liver-1440.webp" }]);
    expect(changes).toEqual(["thumbnail", "images", "metadata.cover"]);
  });

  it("holds Ivan's 1.2 text and the four lower sections' data", () => {
    expect(data.description.startsWith("Без лекарств и препаратов.")).toBe(true);
    expect(data.description).toContain("- Быстро утомляетесь Мало энергии");
    expect(data.course_page.faq).toHaveLength(9);
    expect(data.course_page.testimonials.every((item) => item.author.length > 0)).toBe(true);
    expect(JSON.stringify(data.course_page)).not.toMatch(/15000|10000 рублей/);
  });
});
