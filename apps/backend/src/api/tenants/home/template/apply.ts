import type {
  FieldError,
  ForbiddenRule,
  StorefrontSettingsInput,
} from "../../../store/storefront-settings/validation";
import {
  THEME_PRESETS,
  TENANT_HOME_SCHEMA_ID,
  type TenantHomeDocument,
  type ThemePreset,
} from "../validators";
import {
  CATALOG,
  HOME_SLOTS,
  TEMPLATE_SCHEMA,
  catalogBlock,
  PROPS_CHECKS,
  sameJson,
  unchangeableProps,
  validateTemplate,
  type TemplateLayers,
  type TemplateManifest,
  type TemplateSection,
} from "./validation";

/**
 * Applying a store template to a shop's home document (t-2026-10-12-33). Pure, so the
 * unit specs run it without a container; `route.ts` reads the shop and writes the result.
 *
 * A template expands into fields the document already has, `settings` and `theme.preset`,
 * and three it gains: `theme.layers`, `content.sections` and `template`. The shop's own
 * content (hero copy, which products, banners) is kept: a template is a layout and a look,
 * not the shop's words.
 */

/**
 * What the owner may change while applying: the layers, the palette, a section's props. The
 * props only of a block the backend can check (`PROPS_CHECKS`, `propsEditable` in the
 * catalogue); another block's props may be sent back unchanged, nothing else.
 */
export type TemplateOverrides = {
  palette?: string;
  layers?: Partial<TemplateLayers>;
  /** A section by its place in the template; `block` must be the one standing there. */
  sections?: Array<{ index: number; block: string; props: Record<string, unknown> }>;
};

export type Applied =
  | { ok: true; manifest: TemplateManifest; advisories: string[] }
  | { ok: false; errors: FieldError[]; forbidden?: ForbiddenRule };

/** The template as the catalogue holds it, or null when the id is not there. */
export const catalogTemplate = (id: string): unknown | null =>
  Object.prototype.hasOwnProperty.call(CATALOG.templates, id) ? CATALOG.templates[id] : null;

/**
 * The template with the owner's overrides laid over it, validated as a whole by the same
 * rules the template itself passed. An override can only replace a value in place: it
 * cannot add or move a section, so it cannot bring in a block outside the registry, and the
 * settings it would have to change to break a FORBIDDEN pair are not overridable at all.
 */
export function applyTemplate(source: unknown, overrides: TemplateOverrides = {}): Applied {
  const base = validateTemplate(source);
  if (!base.ok) return { ok: false, errors: base.errors, forbidden: base.forbidden };

  const template = base.value;
  const errors: FieldError[] = [];
  const sections: TemplateSection[] = template.sections.map((section) => ({ ...section }));

  for (const [n, override] of (overrides.sections ?? []).entries()) {
    const at = `overrides.sections[${n}]`;
    const target = sections[override.index];
    if (!target) {
      errors.push({ field: `${at}.index`, message: `${override.index} is not a section of ${template.id}.` });
    } else if (target.block !== override.block) {
      errors.push({
        field: `${at}.block`,
        message: `section ${override.index} of ${template.id} is ${target.block}, not ${override.block}.`,
      });
    } else if (
      catalogBlock(target.block)?.props &&
      !PROPS_CHECKS[target.block] &&
      !sameJson(override.props, target.props)
    ) {
      errors.push({ field: `${at}.props`, message: unchangeableProps(target.block) });
    } else {
      sections[override.index] = { block: target.block, props: override.props };
    }
  }
  if (errors.length) return { ok: false, errors };

  const merged = {
    ...template,
    theme: {
      ...template.theme,
      ...(overrides.palette !== undefined ? { palette: overrides.palette } : {}),
      ...overrides.layers,
    },
    sections,
  };
  const result = validateTemplate(merged);
  if (!result.ok) return { ok: false, errors: result.errors, forbidden: result.forbidden };
  return { ok: true, manifest: result.value, advisories: result.advisories };
}

/**
 * `data-theme` of the stored document. `default` is not a preset id of the document's own
 * enum (`THEME_PRESETS`); `styles/themes.css` paints it from the very rule blocks of
 * `medusa`, so it is stored as that.
 */
export function presetOf(palette: string): ThemePreset | null {
  const preset = palette === "default" ? "medusa" : palette;
  return (THEME_PRESETS as readonly string[]).includes(preset) ? (preset as ThemePreset) : null;
}

const layersOf = (theme: TemplateManifest["theme"]): TemplateLayers => ({
  radius: theme.radius,
  buttonStyle: theme.buttonStyle,
  photoStyle: theme.photoStyle,
  density: theme.density,
});

/** The content of a shop that never saved a document: what the panel's empty form saves. */
const EMPTY_CONTENT: TenantHomeDocument["content"] = {
  hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
  products: { source: "popular" },
  order: ["hero", "categories", "products"],
  banners: [],
};

/** The document a shop holds after applying `manifest`, its own content carried over. */
export function documentFromTemplate(
  manifest: TemplateManifest,
  preset: ThemePreset,
  previous: TenantHomeDocument | null,
  updatedAt: string,
): TenantHomeDocument {
  const content = previous?.content ?? EMPTY_CONTENT;
  return {
    schema: TENANT_HOME_SCHEMA_ID,
    theme: { preset, layers: layersOf(manifest.theme) },
    settings: manifest.settings,
    content: { ...content, sections: manifest.sections },
    template: { id: manifest.id, schema: TEMPLATE_SCHEMA, fontPair: manifest.theme.fontPair },
    updatedAt,
  };
}

/** The saved template of a document as a manifest, for the same validator. */
export function manifestOf(document: TenantHomeDocument): TemplateManifest | null {
  const { template, theme, content } = document;
  if (!template || !theme.layers || !content.sections) return null;
  return {
    schema: TEMPLATE_SCHEMA,
    id: template.id,
    title: template.id,
    description: `Saved from ${template.id}.`,
    settings: document.settings,
    theme: { palette: theme.preset, fontPair: template.fontPair, ...theme.layers },
    sections: content.sections,
  };
}

export type CarriedTemplate = Pick<TenantHomeDocument, "template"> & {
  layers: TemplateLayers;
  sections: TemplateSection[];
};

/**
 * What a plain `PUT /tenants/home` keeps of a saved template. The panel's form knows
 * nothing of templates yet, and without this its next save would drop the shop's choice.
 *
 * A slot section is the page's own slot, and its variant comes from `settings`, so it
 * follows the settings just saved: renamed to the new variant, dropped when the slot is
 * switched off, appended when a slot is switched on that no section places. Every other
 * section stays where it is. Null when there is nothing to carry, or when the result no
 * longer validates (the reason is returned, for the log).
 */
export function carryTemplateOver(
  previous: TenantHomeDocument | null,
  next: { settings: StorefrontSettingsInput; preset: ThemePreset },
): { carried: CarriedTemplate | null; reason?: string } {
  const before = previous ? manifestOf(previous) : null;
  if (!previous?.template || !before) return { carried: null };

  const placed = new Set<string>();
  const sections: TemplateSection[] = [];
  for (const section of before.sections) {
    const entry = catalogBlock(section.block);
    const slot = HOME_SLOTS.find((s) => s.category === entry?.category);
    if (!slot) {
      sections.push(section);
      continue;
    }
    const value = next.settings[slot.field];
    if (value === slot.off || placed.has(slot.category)) continue;
    const block = slotBlock(slot.field, value);
    if (block) {
      sections.push({ block });
      placed.add(slot.category);
    }
  }
  for (const slot of HOME_SLOTS) {
    const value = next.settings[slot.field];
    const block = slotBlock(slot.field, value);
    if (value !== slot.off && !placed.has(slot.category) && block) sections.push({ block });
  }

  const result = validateTemplate({
    ...before,
    settings: next.settings,
    theme: { ...before.theme, palette: next.preset },
    sections,
  });
  if (!result.ok) {
    return { carried: null, reason: result.errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return {
    carried: { template: previous.template, layers: previous.theme.layers as TemplateLayers, sections },
  };
}

/** The home block that places `field: value`, from the catalogue. */
function slotBlock(field: keyof StorefrontSettingsInput, value: string): string | null {
  const block = CATALOG.blocks.find(
    (b) => b.placement === "home" && b.setting?.field === field && b.setting.value === value,
  );
  return block?.id ?? null;
}
