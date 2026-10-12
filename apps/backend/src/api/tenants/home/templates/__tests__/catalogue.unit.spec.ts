import { CATALOG } from "../../template/validation";
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
    expect(longMorning.sections).toEqual([
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
    expect(templateCatalogue(saved).current).toEqual({ id: "long-morning", palette: "ferma", layers, fontPair });

    const onDefault = documentWith({
      theme: { preset: "medusa", layers },
      template: { id: "long-morning", schema: "upready.storefront-template/v1", fontPair },
    });
    expect(templateCatalogue(onDefault).current?.palette).toBe("default");
  });
});
