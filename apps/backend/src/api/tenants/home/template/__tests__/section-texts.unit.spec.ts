import { templateCatalogue } from "../../templates/catalogue";
import { applyTemplate, catalogTemplate, documentFromTemplate, manifestOf, presetOf } from "../apply";
import { CATALOG, sameJson, type TemplateManifest } from "../validation";

/**
 * PE2 (t-2026-10-12-33): the panel edits the texts of a template's sections and sends them as
 * `overrides.sections`. `applyTemplate()` starts from the catalogue template, so applying the live
 * template again with another palette would reset every section to the template's sample, unless
 * the panel sends the shop's saved section props back. This spec walks that round trip the way the
 * panel does it: the saved sections come from `GET /tenants/home/templates` (`current.sections`),
 * and only those whose index and block still match the card go back.
 */

const UHOD = CATALOG.templates.uhod as TemplateManifest;
const at = (block: string) => UHOD.sections.findIndex((section) => section.block === block);
const REVIEWS = at("testimonials/cards");
const SIGNUP = at("newsletter/signup");

type Reviews = { header: { heading: Record<string, string> }; items: Array<{ quote: Record<string, string> }> };
type Signup = { channels: Array<{ network: string; href: string | null }> };

const copy = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

/** The owner's own heading and one own review, and the shop's Telegram channel. */
function ownWords() {
  const reviews = copy<Reviews>(UHOD.sections[REVIEWS].props);
  reviews.header.heading = { ru: "Что говорят наши покупатели", en: "What our customers say" };
  reviews.items[0].quote = { ru: "Крем пришёл за два дня, кожа после него спокойная.", en: "The cream came in two days." };
  const signup = copy<Signup>(UHOD.sections[SIGNUP].props);
  signup.channels[0].href = "https://t.me/uhod_shop";
  return [
    { index: REVIEWS, block: "testimonials/cards", props: reviews as unknown as Record<string, unknown> },
    { index: SIGNUP, block: "newsletter/signup", props: signup as unknown as Record<string, unknown> },
  ];
}

/** What the panel sends back for the live template: the saved props that still match the card and differ from it. */
function carried(document: Parameters<typeof templateCatalogue>[0]) {
  const catalogue = templateCatalogue(document);
  const card = catalogue.templates.find((template) => template.id === catalogue.current!.id)!;
  return catalogue.current!.sections.flatMap((saved, index) => {
    const own = card.sections[index];
    return own && own.block === saved.block && own.editable && saved.props && !sameJson(saved.props, own.props)
      ? [{ index, block: saved.block, props: saved.props }]
      : [];
  });
}

describe("re-applying the live template keeps the shop's section words", () => {
  const first = applyTemplate(catalogTemplate("uhod"), { sections: ownWords() });
  if (!first.ok) throw new Error(JSON.stringify(first.errors));
  const saved = documentFromTemplate(first.manifest, presetOf(first.manifest.theme.palette)!, null, "2026-10-13T00:00:00.000Z");

  it("writes the owner's words and the channel into the saved sections", () => {
    const sections = manifestOf(saved)!.sections;
    expect((sections[REVIEWS].props as Reviews).header.heading.ru).toBe("Что говорят наши покупатели");
    expect((sections[REVIEWS].props as Reviews).items[0].quote.ru).toMatch(/^Крем пришёл/);
    expect((sections[SIGNUP].props as Signup).channels[0].href).toBe("https://t.me/uhod_shop");
  });

  it("gives the panel the saved words back, and only the edited sections go as overrides", () => {
    expect(carried(saved).map(({ index, block }) => ({ index, block }))).toEqual([
      { index: REVIEWS, block: "testimonials/cards" },
      { index: SIGNUP, block: "newsletter/signup" },
    ]);
  });

  it("keeps them through a palette change when the panel sends them back", () => {
    const palette = "ferma";
    expect(presetOf(palette)).toBeTruthy();
    const again = applyTemplate(catalogTemplate("uhod"), { palette, sections: carried(saved) });
    if (!again.ok) throw new Error(JSON.stringify(again.errors));
    const next = documentFromTemplate(again.manifest, presetOf(palette)!, saved, "2026-10-13T01:00:00.000Z");

    expect(next.theme.preset).toBe(palette);
    expect(next.content.sections).toEqual(saved.content.sections);
  });

  it("loses them without the overrides: the gap the panel closes", () => {
    const bare = applyTemplate(catalogTemplate("uhod"), { palette: "ferma" });
    if (!bare.ok) throw new Error(JSON.stringify(bare.errors));
    expect(bare.manifest.sections[REVIEWS].props).toEqual(UHOD.sections[REVIEWS].props);
    expect(bare.manifest.sections[REVIEWS].props).not.toEqual(saved.content.sections![REVIEWS].props);
  });

  it("refuses a text over its limit at its section and path, the frame the panel reads", () => {
    const [reviews] = ownWords();
    (reviews.props as unknown as Reviews).items[0].quote.ru = "о".repeat(5000);
    const refused = applyTemplate(catalogTemplate("uhod"), { sections: [reviews] });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors).toContainEqual({
      field: `sections[${REVIEWS}].props`,
      message: expect.stringMatching(/^items\[0\]\.quote\.ru is 5000 characters, at most \d+$/),
    });
  });

  it("refuses a channel off its network at its path", () => {
    const [, signup] = ownWords();
    (signup.props as unknown as Signup).channels[0].href = "https://example.com/uhod";
    const refused = applyTemplate(catalogTemplate("uhod"), { sections: [signup] });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors).toContainEqual({
      field: `sections[${SIGNUP}].props`,
      message: "channels[0].href must lead to a channel on t.me or telegram.me for telegram",
    });
  });
});
