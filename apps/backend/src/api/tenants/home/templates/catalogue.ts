import { CATALOG, catalogBlock } from "../template/validation";
import type { FontPair, PaletteSwatch, TemplateLayers, TemplateManifest, TemplateText } from "../template/validation";
import type { TenantHomeDocument } from "../validators";

/**
 * One template as the panel's card draws it: its words, its look, and the shape of its home page.
 * The words come per language as the manifest gives them (P2b); the panel picks the owner's.
 */
export type TemplateCard = {
  id: string;
  title: TemplateText;
  description: TemplateText;
  /** The template's own mode: a light-only palette may replace its palette only when this is "light". */
  defaultMode: "light" | "dark";
  theme: TemplateLayers & { palette: string; fontPair: FontPair };
  /** The home page in order: each section's block and the block's category, for the schematic preview. */
  sections: { block: string; category: string }[];
};

export type PaletteEntry = {
  id: string;
  /** Per language, from the palette's own theme file (`specs/design-system/themes`). */
  label: TemplateText;
  /** No dark mode: a template whose `defaultMode` is not "light" cannot take it (400 from `POST /tenants/home/template`). */
  lightOnly: boolean;
  colours: { light: PaletteSwatch; dark?: PaletteSwatch };
};

/** The shop's saved template, with the palette and layers it carries now (overrides included). */
export type CurrentTemplate = {
  id: string;
  palette: string;
  layers: TemplateLayers | null;
  fontPair: FontPair;
};

export type TemplateCatalogue = {
  templates: TemplateCard[];
  palettes: PaletteEntry[];
  layers: TemplateCatalogLayers;
  /** The storefront's gap between home sections at each density, in px: the schematic keeps its proportion. */
  sectionGapPx: Record<string, number>;
  current: CurrentTemplate | null;
};

type TemplateCatalogLayers = typeof CATALOG.layers;

/**
 * `medusa` is how the document stores the palette `default` (`storedPreset`), and `themes.css`
 * paints the two the same: the panel offers one of them, under the template's own name.
 */
const asPalette = (preset: string): string => (preset === "medusa" ? "default" : preset);

/**
 * The answer of `GET /tenants/home/templates` (t-2026-10-12-33 P2): the storefront's template
 * catalogue as the panel's «Шаблоны» section reads it, and the template the shop has saved.
 * Pure: the route reads the document of the shop behind the token and hands it here.
 *
 * Every template of `catalog.generated.json` passed the storefront's `validateTemplate()` on
 * export, so its manifest is read as one. The palettes keep the catalogue's order, `medusa`
 * folded into `default`, each with the colours the storefront paints it in.
 */
export function templateCatalogue(document: TenantHomeDocument | null): TemplateCatalogue {
  const lightOnly = new Set(CATALOG.lightOnlyPalettes);

  const templates = Object.values(CATALOG.templates as Record<string, TemplateManifest>).map(
    (manifest): TemplateCard => ({
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      defaultMode: manifest.settings.defaultMode,
      theme: manifest.theme,
      sections: manifest.sections.map((section) => ({
        block: section.block,
        category: catalogBlock(section.block)?.category ?? section.block.split("/")[0],
      })),
    }),
  );

  const palettes = CATALOG.palettes
    .filter((id) => id !== "medusa")
    .map((id): PaletteEntry => {
      const swatch = CATALOG.swatches[id];
      return {
        id,
        label: swatch.label,
        lightOnly: lightOnly.has(id),
        colours: swatch.dark ? { light: swatch.light, dark: swatch.dark } : { light: swatch.light },
      };
    });

  const current: CurrentTemplate | null = document?.template
    ? {
        id: document.template.id,
        palette: asPalette(document.theme.preset),
        layers: document.theme.layers ?? null,
        fontPair: document.template.fontPair,
      }
    : null;

  return { templates, palettes, layers: CATALOG.layers, sectionGapPx: CATALOG.sectionGapPx, current };
}
