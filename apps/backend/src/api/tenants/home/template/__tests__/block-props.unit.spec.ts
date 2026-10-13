import { applyTemplate, catalogTemplate } from "../apply";
import { CATALOG, PROPS_CHECKS, type TemplateManifest } from "../validation";

/**
 * A shop's own words in a template's sections (t-2026-10-12-33). Every block with props is
 * checked by its storefront parser, which `pnpm templates:export` copies into
 * `props.generated/`, so the owner may replace a template's sample words while applying it,
 * and the backend refuses what the storefront would refuse to draw.
 */

const verdict = (result: { ok: boolean; errors?: { field: string; message: string }[] }) =>
  result.ok ? [] : (result.errors ?? []).map((error) => `${error.field}: ${error.message}`);

const uhod = () => catalogTemplate("uhod") as TemplateManifest;

/** The owner's own reviews in place of the template's invented ones. */
const OWN_REVIEWS = {
  header: { heading: { ru: "Отзывы наших покупателей" } },
  items: [
    {
      quote: { ru: "Крем пришёл за два дня, состав на банке тот же, что на сайте." },
      name: { ru: "Ольга" },
      city: { ru: "Пермь" },
      rating: 5,
    },
    { quote: { ru: "Беру сыворотку уже третий раз." }, name: { ru: "Дина" }, rating: 4 },
  ],
};

describe("the props of every block with a parser", () => {
  it("are checked on the backend and editable in the catalogue", () => {
    const withProps = CATALOG.blocks.filter((block) => block.props);
    expect(withProps.length).toBeGreaterThan(1);
    for (const block of withProps) {
      expect({ id: block.id, editable: block.propsEditable }).toEqual({ id: block.id, editable: true });
      expect(PROPS_CHECKS[block.id]).toEqual(expect.any(Function));
    }
    expect(Object.keys(PROPS_CHECKS).sort()).toEqual(withProps.map((block) => block.id).sort());
  });

  it("let every catalogue template through with its own props", () => {
    for (const id of Object.keys(CATALOG.templates)) {
      expect({ id, errors: verdict(applyTemplate(catalogTemplate(id))) }).toEqual({ id, errors: [] });
    }
  });
});

describe("uhod with the owner's own reviews", () => {
  const at = uhod().sections.findIndex((section) => section.block === "testimonials/cards");

  it("has a testimonials/cards section", () => {
    expect(at).toBeGreaterThanOrEqual(0);
  });

  it("applies with the owner's reviews in place of the template's", () => {
    const applied = applyTemplate(uhod(), {
      sections: [{ index: at, block: "testimonials/cards", props: OWN_REVIEWS }],
    });
    expect(verdict(applied)).toEqual([]);
    expect(applied.ok && applied.manifest.sections[at]).toEqual({ block: "testimonials/cards", props: OWN_REVIEWS });
  });

  it("refuses a 5 000-character quote with the storefront parser's message", () => {
    const long = JSON.parse(JSON.stringify(OWN_REVIEWS));
    long.items[0].quote.ru = "о".repeat(5000);
    const applied = applyTemplate(uhod(), {
      sections: [{ index: at, block: "testimonials/cards", props: long }],
    });
    expect(verdict(applied)).toEqual([`sections[${at}].props: items[0].quote.ru is 5000 characters, at most 400`]);
  });
});
