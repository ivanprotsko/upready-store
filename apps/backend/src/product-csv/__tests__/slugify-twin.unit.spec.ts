import { readFileSync } from "fs";
import { join } from "path";
import { toSlug, transliterate } from "../slugify";

/**
 * The panel carries its own copy of this transliteration
 * (`apps/tenant-panel/src/lib/slugify.ts`, f11-new-product-404), because the
 * two apps ship in separate Docker images and share no package. A copy drifts
 * unless something fails when only one side is edited, so this is that
 * something: it reads both files and compares the block each marks as shared.
 *
 * Formatting is normalised away rather than matched, because the two apps
 * disagree about semicolons on purpose (AGENTS.md, "Formatting Differs Between
 * the Two Apps"). Everything else — the table, the order, the rules of
 * `toSlug` — has to be character for character the same.
 */

const START = "/* --- shared with the twin, keep identical --- */";
const END = "/* --- end of the shared block --- */";

const sharedBlock = (path: string): string => {
  const source = readFileSync(path, "utf8");
  const from = source.indexOf(START);
  const to = source.indexOf(END);

  expect([path, from > -1, to > from]).toEqual([path, true, true]);

  return source
    .slice(from + START.length, to)
    .replace(/;\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
};

const BACKEND = join(__dirname, "..", "slugify.ts");
const PANEL = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "tenant-panel",
  "src",
  "lib",
  "slugify.ts",
);

describe("slugify twin", () => {
  it("the panel's copy is the same transliteration", () => {
    const backend = sharedBlock(BACKEND);

    // Guards the guard: an empty or truncated read would make any two files
    // agree (rule 20a — a zero is a measurement, not an absence).
    expect(backend.length).toBeGreaterThan(400);
    expect(backend).toContain('щ: "sch"');

    expect(sharedBlock(PANEL)).toEqual(backend);
  });

  it("turns the names this shop actually sells into Latin codes", () => {
    expect(toSlug("Мёд трутневой")).toBe("med-trutnevoy");
    expect(toSlug("ТЕСТ QA — не покупать")).toBe("test-qa-ne-pokupat");
    expect(toSlug("АСД-2 фракция, 100 мл")).toBe("asd-2-fraktsiya-100-ml");
    expect(toSlug("Шампунь мумиё")).toBe("shampun-mumie");
    expect(transliterate("Щётка")).toBe("schetka");
  });

  it("gives an empty string rather than a placeholder when nothing survives", () => {
    expect(toSlug("")).toBe("");
    expect(toSlug("— — —")).toBe("");
  });
});
