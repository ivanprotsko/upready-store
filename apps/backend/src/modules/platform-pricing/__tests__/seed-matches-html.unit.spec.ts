import { existsSync, readFileSync } from "fs";
import vm from "vm";
import { PricingDocumentSchema } from "../schema";
import { OKSANA_3TIER_PRICING as seed } from "../seed/oksana-3tier";

/**
 * The seeded pricing page against the file it was copied from (t-2026-09-25-08,
 * Ivan's 4.1: «точно такие же данные как и в html файле»).
 *
 * The file is Ivan's and stays out of the repository, so the suite reads it
 * from `PRICING_SOURCE_HTML`, or from where he saved it. Where neither exists
 * (CI) the suite is skipped with a warning; it is the acceptance check on the
 * machine that has the file, not a gate for every run.
 */
const SOURCE =
  process.env.PRICING_SOURCE_HTML ?? "/Users/ivanprotsko/Downloads/oksana-3tier-pricing.html";

type SourceTier = {
  name: string;
  short?: string;
  price: string;
  priceNote: string;
  reco?: boolean;
  desc: string;
  plus: string;
  cta: { label: string; solid?: boolean; href: string };
  features: string[];
};
type SourceSection = {
  icon: string;
  eyebrow: string;
  heading: string;
  chips?: string[];
  moreChip?: string;
  rows: { feature: string; values: string[] }[];
};
type SourcePricing = {
  featuresLabel: string;
  tiers: SourceTier[];
  sections: SourceSection[];
  tips: Record<string, string>;
};

/** `window.PRICING` as the page itself would evaluate it. */
function readPricing(html: string): SourcePricing {
  const match = html.match(/<script>\s*(window\.PRICING = \{[\s\S]*?\n\};)/);
  if (!match) throw new Error("window.PRICING not found in the source HTML");
  const context: { window: { PRICING?: SourcePricing } } = { window: {} };
  vm.runInNewContext(match[1], context);
  if (!context.window.PRICING) throw new Error("window.PRICING did not evaluate");
  return context.window.PRICING;
}

/** A markup text the way the seed stores it: `&nbsp;` kept, `<br>` → `\n`, `<b>` → `**`. */
function markup(fragment: string): string {
  return fragment
    .replace(/&nbsp;/g, " ")
    .replace(/<br>/g, "\n")
    .replace(/<\/?b>/g, "**")
    .trim();
}

function one(html: string, re: RegExp): string {
  const match = html.match(re);
  if (!match) throw new Error(`not found in the source HTML: ${re}`);
  return markup(match[1]);
}

function all(html: string, re: RegExp): string[] {
  return [...html.matchAll(re)].map((m) => markup(m[1]));
}

const hasSource = existsSync(SOURCE);
if (!hasSource) {
  console.warn(`seed-matches-html: ${SOURCE} is absent, the comparison is skipped (set PRICING_SOURCE_HTML).`);
}

(hasSource ? describe : describe.skip)("platform pricing seed = oksana-3tier-pricing.html", () => {
  const html = hasSource ? readFileSync(SOURCE, "utf8") : "";
  const source = hasSource ? readPricing(html) : ({} as SourcePricing);
  const tierIds = seed.tiers.map((t) => t.id);

  it("is a valid document", () => {
    expect(() => PricingDocumentSchema.parse(seed)).not.toThrow();
  });

  it("has the same four tiers, word for word", () => {
    expect(seed.tiers.map((t) => t.name)).toEqual(["Старт", "Рост", "Масштаб", "Глобализация"]);
    expect(seed.tiers).toHaveLength(source.tiers.length);

    source.tiers.forEach((tier, i) => {
      const got = seed.tiers[i];
      expect({
        name: got.name,
        short: got.short_name,
        price: got.price,
        priceNote: got.price_note,
        reco: got.recommended,
        desc: got.description,
        plus: got.plus,
        features: got.features.map((f) => f.text),
        cta: {
          label: got.button.label,
          solid: got.button.style === "solid",
          href: got.button.action.type === "link" ? got.button.action.href : null,
        },
      }).toEqual({
        name: tier.name,
        short: tier.short ?? "",
        price: tier.price,
        priceNote: tier.priceNote,
        reco: tier.reco === true,
        desc: tier.desc,
        plus: tier.plus,
        features: tier.features,
        cta: { label: tier.cta.label, solid: tier.cta.solid === true, href: tier.cta.href },
      });
    });
  });

  it("has the same four sections, chips and every row value", () => {
    expect(seed.features_label).toBe(source.featuresLabel);
    expect(seed.sections).toHaveLength(4);
    expect(seed.sections).toHaveLength(source.sections.length);

    source.sections.forEach((section, s) => {
      const got = seed.sections[s];
      expect([got.icon, got.eyebrow, got.heading]).toEqual([section.icon, section.eyebrow, section.heading]);
      expect(got.chips).toEqual(section.chips ?? []);
      expect(got.more_chip).toBe(section.moreChip ?? "");
      expect(got.rows.map((r) => r.feature)).toEqual(section.rows.map((r) => r.feature));

      section.rows.forEach((row, r) => {
        const values = tierIds.map((id) => {
          const value = got.rows[r].values[id];
          return value.type === "text" ? value.text : value.type;
        });
        expect(values).toEqual(row.values);
      });
    });
  });

  it("puts every tooltip on the feature it was written for, and drops none", () => {
    const items = [
      ...seed.tiers.flatMap((t) => t.features.map((f) => ({ key: f.text, tip: f.tip }))),
      ...seed.sections.flatMap((s) => s.rows.map((r) => ({ key: r.feature, tip: r.tip }))),
    ];

    for (const item of items) {
      expect({ key: item.key, tip: item.tip }).toEqual({ key: item.key, tip: source.tips[item.key] ?? "" });
    }

    const used = new Set(items.map((item) => item.key));
    expect(Object.keys(source.tips).filter((key) => !used.has(key))).toEqual([]);
    expect(Object.keys(source.tips)).toHaveLength(33);
  });

  it("has the page texts of the markup", () => {
    const labels = all(html, /<span class="hl-label">([\s\S]*?)<\/span>/g);
    const descs = all(html, /<p class="hl-desc">([\s\S]*?)<\/p>/g);
    const boxTitles = all(html, /<div class="fbox">\s*<h3>([\s\S]*?)<\/h3>/g);
    const boxTexts = all(html, /<div class="fbox">\s*<h3>[\s\S]*?<\/h3>\s*<p>([\s\S]*?)<\/p>/g);

    expect(seed.page).toEqual({
      meta_title: one(html, /<title>([\s\S]*?)<\/title>/),
      eyebrow: one(html, /<span class="eyebrow">[\s\S]*?<\/svg>([\s\S]*?)<\/span>/),
      title: one(html, /<h1>([\s\S]*?)<\/h1>/),
      note: one(html, /<p class="hero-note">([\s\S]*?)<\/p>/),
    });
    expect(seed.highlights.map((h) => [h.label, h.text])).toEqual(labels.map((l, i) => [l, descs[i]]));
    expect(seed.explainers.map((e) => [e.title, e.text])).toEqual(boxTitles.map((t, i) => [t, boxTexts[i]]));
    expect([seed.final.title, seed.final.text]).toEqual([
      one(html, /<div class="cta-left">\s*<h2>([\s\S]*?)<\/h2>/),
      one(html, /<div class="cta-left">\s*<h2>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/),
    ]);
    const finalButton = html.match(/<div class="cta-right">\s*<a class="btn solid" href="([^"]*)">([\s\S]*?)<\/a>/);
    expect(finalButton).not.toBeNull();
    expect(seed.final.button).toEqual({
      label: markup(finalButton![2]),
      style: "solid",
      action: { type: "link", href: finalButton![1] },
    });
  });

  it("has the drawer's own words", () => {
    for (const words of Object.values(seed.drawer)) {
      expect(html).toContain(words);
    }
  });
});
