import { CATALOG, catalogBlock, type TemplateManifest } from "../../template/validation";
import type { TenantHomeDocument } from "../../validators";
import { templateCatalogue } from "../catalogue";

/**
 * `GET /tenants/home/templates` (t-2026-10-12-33 P2): what the panel's «Шаблоны» section
 * reads. The catalogue is the exported one; `current` comes from the document handed in.
 */

const documentWith = (over: Partial<TenantHomeDocument> = {}): TenantHomeDocument => ({
  schema: "upready.tenant-home/v1",
  theme: { preset: "sneakers" },
  settings: { defaultMode: "light", header: "h2", hero: "h", tiles: "on", listing: "p4", footer: "f1" },
  content: {
    hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
  updatedAt: "2026-10-13T00:00:00.000Z",
  ...over,
});

describe("templateCatalogue", () => {
  it("lists every catalogue template with its look and the categories of its sections", () => {
    const { templates } = templateCatalogue(null);
    expect(templates.map((template) => template.id).sort()).toEqual(Object.keys(CATALOG.templates).sort());

    const longMorning = templates.find((template) => template.id === "long-morning")!;
    expect(longMorning).toMatchObject({
      // P2b: the words in every language the manifest gives, for the panel to pick the owner's.
      title: { ru: "Долгое утро", en: "Long Morning" },
      description: { ru: expect.stringMatching(/[а-яё]/i), en: expect.any(String) },
      defaultMode: "light",
      theme: { palette: "home-goods", radius: "soft", buttonStyle: "filled", photoStyle: "landscape", density: "spacious" },
    });
    expect(longMorning.theme.fontPair).toEqual({ display: "Cormorant Garamond", body: "Manrope" });
    expect(longMorning.sections.map(({ block, category }) => ({ block, category }))).toEqual([
      { block: "announcement/text-bar", category: "announcement" },
      { block: "hero/h", category: "hero" },
      { block: "tiles/on", category: "tiles" },
      { block: "listing/p4", category: "listing" },
    ]);
  });

  it("gives every palette its name and colours, folds medusa into default and marks the light-only ones", () => {
    const { palettes } = templateCatalogue(null);
    const ids = palettes.map((palette) => palette.id);
    expect(ids).not.toContain("medusa");
    expect(ids).toEqual(CATALOG.palettes.filter((id) => id !== "medusa"));

    for (const palette of palettes) {
      expect(palette.label).toBeTruthy();
      expect(Object.keys(palette.colours.light).sort()).toEqual(["accent", "background", "foreground", "muted", "primary"]);
      expect(palette.lightOnly).toBe(CATALOG.lightOnlyPalettes.includes(palette.id));
      expect(Boolean(palette.colours.dark)).toBe(!palette.lightOnly);
    }
    expect(palettes.find((palette) => palette.id === "ferma")).toMatchObject({
      lightOnly: true,
      label: { ru: "Ферма", en: "Ferma" },
    });
    expect(palettes.find((palette) => palette.id === "default")?.label).toEqual({ ru: "Стандартная", en: "Medusa default" });
  });

  it("answers the layer vocabularies of the catalogue", () => {
    expect(templateCatalogue(null).layers).toEqual({
      radius: ["sharp", "soft", "round", "pill"],
      buttonStyle: ["filled", "outlined"],
      photoStyle: ["square", "portrait", "landscape", "wide"],
      density: ["compact", "comfortable", "spacious"],
    });
  });

  it("answers the storefront's gap between home sections at each density", () => {
    expect(templateCatalogue(null).sectionGapPx).toEqual({ compact: 32, comfortable: 48, spacious: 64 });
  });

  it("has no current template for a shop with no document, or a document with no template", () => {
    expect(templateCatalogue(null).current).toBeNull();
    expect(templateCatalogue(documentWith()).current).toBeNull();
  });

  it("reads the current template, palette and layers from the shop's own document, medusa as default", () => {
    const layers = { radius: "pill", buttonStyle: "outlined", photoStyle: "square", density: "compact" } as const;
    const fontPair = { display: "Cormorant Garamond", body: "Manrope" };
    const saved = documentWith({
      theme: { preset: "ferma", layers },
      template: { id: "long-morning", schema: "upready.storefront-template/v1", fontPair },
    });
    // No `content.sections` in this document: nothing of the shop's own to carry (PE2).
    expect(templateCatalogue(saved).current).toEqual({ id: "long-morning", palette: "ferma", layers, fontPair, sections: [] });

    const onDefault = documentWith({
      theme: { preset: "medusa", layers },
      template: { id: "long-morning", schema: "upready.storefront-template/v1", fontPair },
    });
    expect(templateCatalogue(onDefault).current?.palette).toBe("default");
  });

  /* PE2: the panel edits a section's texts, so the card carries each section's props and whether the backend can
     check a change of them, and `current` carries the shop's own saved sections. */

  it("gives each card's section the template's own props and whether the block's props may change", () => {
    const { templates } = templateCatalogue(null);
    for (const card of templates) {
      const manifest = CATALOG.templates[card.id] as TemplateManifest;
      card.sections.forEach((section, index) => {
        const own = manifest.sections[index];
        expect(section.block).toBe(own.block);
        expect(section.props).toEqual(own.props);
        expect(section.editable).toBe(catalogBlock(own.block)?.propsEditable ?? false);
      });
    }
    const uhod = templates.find((template) => template.id === "uhod")!;
    const reviews = uhod.sections.find((section) => section.block === "testimonials/cards")!;
    expect(reviews).toMatchObject({ category: "testimonials", editable: true });
    expect(reviews.props).toMatchObject({ header: { heading: { ru: expect.any(String), en: expect.any(String) } } });
    // A slot block takes no props from a template: none on the card either.
    expect(uhod.sections.find((section) => section.block === "tiles/on")).toEqual({
      block: "tiles/on",
      category: "tiles",
      editable: false,
    });
  });

  it("answers the catalogue's languages, which decide what the panel reads as a text", () => {
    expect(templateCatalogue(null).locales).toEqual(CATALOG.locales);
    expect(templateCatalogue(null).locales).toEqual(expect.arrayContaining(["ru", "en"]));
  });

  it("gives the current template the shop's own saved sections, its words included", () => {
    const uhod = CATALOG.templates.uhod as TemplateManifest;
    const index = uhod.sections.findIndex((section) => section.block === "testimonials/cards");
    const own = JSON.parse(JSON.stringify(uhod.sections[index].props)) as { header: { heading: Record<string, string> } };
    own.header.heading.ru = "Что говорят наши покупатели";
    const sections = uhod.sections.map((section, at) => (at === index ? { ...section, props: own } : section));
    const saved = documentWith({
      settings: uhod.settings,
      theme: { preset: uhod.theme.palette as TenantHomeDocument["theme"]["preset"], layers: { radius: uhod.theme.radius, buttonStyle: uhod.theme.buttonStyle, photoStyle: uhod.theme.photoStyle, density: uhod.theme.density } },
      content: { ...documentWith().content, sections },
      template: { id: "uhod", schema: "upready.storefront-template/v1", fontPair: uhod.theme.fontPair },
    });

    const current = templateCatalogue(saved).current!;
    expect(current.sections).toHaveLength(uhod.sections.length);
    expect(current.sections[index]).toEqual({ block: "testimonials/cards", category: "testimonials", props: own });
    // A section saved with no props has none here.
    const tiles = uhod.sections.findIndex((section) => section.block === "tiles/on");
    expect(current.sections[tiles]).toEqual({ block: "tiles/on", category: "tiles" });
  });
});
