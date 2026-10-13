import catalogJson from "./catalog.generated.json";
import {
  isForbidden,
  validateFields,
  type FieldError,
  type ForbiddenRule,
  type StorefrontSettingsInput,
} from "../../../store/storefront-settings/validation";

/**
 * Backend's copy of the store template validator (t-2026-10-12-33): a transcription of
 * `validateTemplate()` in `apps/storefront/src/lib/templates/manifest.ts`, the way
 * `store/storefront-settings/validation.ts` transcribes the storefront's `composition.ts`.
 * There is no shared package between the two apps (`pnpm-workspace.yaml` lists only
 * `apps/**`), and the storefront's registry imports React components, so:
 *
 * - the vocabularies and the catalogue come from `catalog.generated.json`, which the
 *   storefront writes (`pnpm templates:export` in `apps/storefront`) and fails a test on
 *   when it drifts;
 * - the logic below is transcribed by hand, and `apps/storefront/src/lib/templates/
 *   parity.test.ts` runs this file and `manifest.ts` on the same fixtures
 *   (`parity.fixtures.json`), so a rule changed on one side and not the other fails there.
 *
 * Pure module: no framework import, so the storefront's vitest can load it.
 */

export const TEMPLATE_SCHEMA = "upready.storefront-template/v1";

export const RADII = ["sharp", "soft", "round", "pill"] as const;
export const BUTTON_STYLES = ["filled", "outlined"] as const;
export const PHOTO_STYLES = ["square", "portrait", "landscape", "wide"] as const;
export const DENSITIES = ["compact", "comfortable", "spacious"] as const;

export type Radius = (typeof RADII)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type PhotoStyle = (typeof PHOTO_STYLES)[number];
export type Density = (typeof DENSITIES)[number];

/** The four style layers that paint the page today (`theme.layers` of the tenant home document). */
export type TemplateLayers = {
  radius: Radius;
  buttonStyle: ButtonStyle;
  photoStyle: PhotoStyle;
  density: Density;
};

export type FontPair = { display: string; body: string };

export type TemplateSection = { block: string; props?: Record<string, unknown> };

/** `{ "ru": "…", "en": "…" }` keyed by the catalogue's `locales`, or one string for every language (P2b). */
export type TemplateText = string | Record<string, string>;

export type TemplateManifest = {
  schema: typeof TEMPLATE_SCHEMA;
  id: string;
  title: TemplateText;
  description: TemplateText;
  settings: StorefrontSettingsInput;
  theme: TemplateLayers & { palette: string; fontPair: FontPair };
  sections: TemplateSection[];
};

/** One block of the storefront registry, as far as validation needs it. */
export type CatalogBlock = {
  id: string;
  category: string;
  placement: "site" | "home";
  status: "live" | "lab" | "placeholder";
  setting?: { field: keyof StorefrontSettingsInput; value: string };
  /** The block has a props parser on the storefront. */
  props: boolean;
  /**
   * `PROPS_CHECKS` below holds a copy of that parser, so a shop may change the block's props.
   * Without one the backend takes the props the catalogue template gives the block, and only
   * those. The panel offers a prop edit only where this is true.
   */
  propsEditable: boolean;
};

/** Five colours of a palette in one mode, as the storefront's generated `themes.css` paints them. */
export type PaletteSwatch = { background: string; foreground: string; primary: string; accent: string; muted: string };

export type TemplateCatalog = {
  schema: string;
  palettes: string[];
  /** Palettes with no dark mode (`LIGHT_ONLY_THEME_IDS`): they need `settings.defaultMode` "light". */
  lightOnlyPalettes: string[];
  /** Each palette's name and colours, for the panel's swatches; a light-only palette has `light` alone. */
  swatches: Record<string, { label: TemplateText; light: PaletteSwatch; dark?: PaletteSwatch }>;
  fonts: string[];
  layers: { radius: string[]; buttonStyle: string[]; photoStyle: string[]; density: string[] };
  /** The storefront's gap between home sections at each density, in px, for the panel's schematic. */
  sectionGapPx: Record<string, number>;
  locales: string[];
  blocks: CatalogBlock[];
  templates: Record<string, unknown>;
};

export const CATALOG = catalogJson as unknown as TemplateCatalog;

const BLOCKS_BY_ID = new Map(CATALOG.blocks.map((block) => [block.id, block]));

export const catalogBlock = (id: string): CatalogBlock | null => BLOCKS_BY_ID.get(id) ?? null;

export type TemplateValidation =
  | { ok: true; value: TemplateManifest; advisories: string[] }
  | { ok: false; errors: FieldError[]; forbidden?: ForbiddenRule };

/** The three home slots of the composition document, and the block category of each. */
export const HOME_SLOTS = [
  { field: "hero", category: "hero", off: "none" },
  { field: "tiles", category: "tiles", off: "off" },
  { field: "listing", category: "listing", off: "none" },
] as const;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function oneOf(errors: FieldError[], field: string, value: unknown, allowed: readonly string[]): boolean {
  if (typeof value === "string" && allowed.includes(value)) return true;
  errors.push({ field, message: `${field} must be one of: ${allowed.join(", ")}.` });
  return false;
}

/** A `TemplateText`: a non-empty string, or at least one language of `i18n/config.ts`, each a non-empty string. */
function textErrors(field: string, value: unknown): FieldError[] {
  if (typeof value === "string" && value.trim()) return [];
  if (!isObject(value) || Object.keys(value).length === 0) {
    return [{ field, message: `${field} must be a non-empty string or an object of language code to text.` }];
  }
  const errors: FieldError[] = [];
  for (const [code, line] of Object.entries(value)) {
    const at = `${field}.${code}`;
    if (!LOCALE_CODES.has(code)) errors.push({ field: at, message: `${at} is not a language of i18n/config.ts.` });
    else if (typeof line !== "string" || !line.trim()) errors.push({ field: at, message: `${at} must be a non-empty string.` });
  }
  return errors;
}

/* ------------------------------------------------------------------ block props */

const LOCALE_CODES = new Set(CATALOG.locales);

/** `parseLocalizedText` of `modules/blocks/shared/parse.ts`, with no fallback: the text is required. */
function checkLocalizedText(value: unknown, path: string, max: number): string[] {
  if (!isObject(value)) return [`${path} must be an object of language code to string`];
  const errors: string[] = [];
  for (const [code, line] of Object.entries(value)) {
    if (!LOCALE_CODES.has(code)) errors.push(`${path}.${code}: not a language of i18n/config.ts`);
    if (typeof line !== "string") errors.push(`${path}.${code} must be a string`);
    else if (line.length > max) errors.push(`${path}.${code} is ${line.length} characters, at most ${max}`);
  }
  return errors;
}

/** `parseHref` of `modules/blocks/shared/parse.ts`, optional: absent is null. */
function checkHref(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string" || !(value.startsWith("/") || value.startsWith("https://"))) {
    return [`${path} must start with / or https://`];
  }
  if (/^\/[/\\]/.test(value)) return [`${path}: ${value.slice(0, 2)} leads to another site; write https://`];
  if (value.length > 2048 || /\s/.test(value)) {
    return [`${path} must be one address, no spaces, at most 2048 characters`];
  }
  if (value.startsWith("https://")) {
    try {
      new URL(value);
    } catch {
      return [`${path} is not an address`];
    }
  }
  return [];
}

/**
 * `parseTextBarProps` of `modules/blocks/announcement/text-bar/props.ts`, which is one
 * `parseProps(…)` call of `shared/parse.ts`: absent props are `{}`, the fields are read in
 * their listed order, then every key the block does not list is refused.
 */
function checkTextBarProps(input: unknown): string[] {
  const value = input ?? {};
  if (!isObject(value)) return ["props must be an object { text, href }"];
  const { text, href, ...rest } = value;
  const errors = [...checkLocalizedText(text, "text", 140), ...checkHref(href, "href")];
  for (const key of Object.keys(rest)) errors.push(`${key}: not a prop of announcement/text-bar`);
  return errors;
}

/**
 * The props check of a block whose storefront entry has a `parseProps`, by block id. Not every
 * such block has one: a block PR adds its parser on the storefront only. A block with
 * `props: true` and no line here takes the props its catalogue template gives it
 * (`catalogueProps`), never props of the shop's own; `parity.test.ts` holds every line here
 * to a storefront parser.
 */
export const PROPS_CHECKS: Record<string, (input: unknown) => string[]> = {
  "announcement/text-bar": checkTextBarProps,
};

/** The refusal of props a shop changed on a block `PROPS_CHECKS` has no line for. */
export const unchangeableProps = (block: string): string => `props of ${block} cannot be changed yet`;

/** Equal as JSON: arrays in order, object keys in any order, absent equal to absent. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameJson(a[key], b[key]));
  }
  return a === b;
}

/**
 * The props catalogue template `templateId` gives `block`, at each place it stands there.
 * Those passed the storefront's own `validateTemplate()` (`manifest.test.ts`) and came over
 * unchanged in the export, so they are safe for a block whose props this side cannot check.
 * By block rather than by index: `carryTemplateOver()` moves the sections after a slot that
 * a plain `PUT` switched off or on.
 */
export function catalogueProps(templateId: unknown, block: string): unknown[] {
  if (typeof templateId !== "string" || !Object.prototype.hasOwnProperty.call(CATALOG.templates, templateId)) {
    return [];
  }
  const sections = (CATALOG.templates[templateId] as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.filter((s) => isObject(s) && s.block === block).map((s) => (s as { props?: unknown }).props);
}

/* ------------------------------------------------------------------ the validator */

/**
 * `validateTemplate()` of `manifest.ts`, line for line. `lookup` answers a block id with its
 * catalogue entry (`catalogBlock` in production). The composition's own ADVISORY pairs are
 * not on this side (`store/storefront-settings/validation.ts` never had them), so the only
 * advisory here is a placeholder block.
 */
export function validateTemplate(
  input: unknown,
  lookup: (id: string) => CatalogBlock | null = catalogBlock,
): TemplateValidation {
  if (!isObject(input)) return { ok: false, errors: [{ field: "_root", message: "A template is a JSON object." }] };
  const errors: FieldError[] = [];
  const advisories: string[] = [];

  if (input.schema !== TEMPLATE_SCHEMA) {
    errors.push({ field: "schema", message: `schema must be "${TEMPLATE_SCHEMA}".` });
  }
  if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) {
    errors.push({ field: "id", message: "id must be kebab-case: a-z, 0-9 and single hyphens." });
  }
  for (const field of ["title", "description"] as const) errors.push(...textErrors(field, input[field]));

  // settings: the composition's own validation, field enums first and FORBIDDEN after.
  const fieldErrors = validateFields(input.settings);
  const settings = fieldErrors.length ? null : (input.settings as StorefrontSettingsInput);
  if (!settings) {
    errors.push(...fieldErrors.map((e) => ({ field: `settings.${e.field}`, message: e.message })));
  } else {
    const rule = isForbidden(settings);
    if (rule) {
      errors.push({
        field: `settings.${rule.field}`,
        message: `${rule.field} "${rule.value}" with ${rule.against} "${rule.againstValue}" is forbidden: ${rule.reason}`,
      });
      return { ok: false, errors, forbidden: rule };
    }
  }

  // theme: every layer from its own list.
  const theme = input.theme;
  if (!isObject(theme)) {
    errors.push({ field: "theme", message: "theme must be an object." });
  } else {
    if (oneOf(errors, "theme.palette", theme.palette, CATALOG.palettes)) {
      const lightOnly = CATALOG.lightOnlyPalettes.includes(theme.palette as string);
      if (lightOnly && settings && settings.defaultMode !== "light") {
        errors.push({
          field: "settings.defaultMode",
          message: `theme.palette "${theme.palette}" has no dark mode; settings.defaultMode must be "light".`,
        });
      }
    }
    if (!isObject(theme.fontPair)) {
      errors.push({ field: "theme.fontPair", message: "theme.fontPair must be { display, body }." });
    } else {
      oneOf(errors, "theme.fontPair.display", theme.fontPair.display, CATALOG.fonts);
      oneOf(errors, "theme.fontPair.body", theme.fontPair.body, CATALOG.fonts);
    }
    oneOf(errors, "theme.radius", theme.radius, RADII);
    oneOf(errors, "theme.buttonStyle", theme.buttonStyle, BUTTON_STYLES);
    oneOf(errors, "theme.photoStyle", theme.photoStyle, PHOTO_STYLES);
    oneOf(errors, "theme.density", theme.density, DENSITIES);
  }

  // sections: known home blocks, valid props, and the three slots in step with settings.
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    errors.push({ field: "sections", message: "sections must be a non-empty array." });
  } else {
    const seen = new Map<string, number>();
    input.sections.forEach((section: unknown, index: number) => {
      const at = `sections[${index}]`;
      if (!isObject(section) || typeof section.block !== "string") {
        errors.push({ field: at, message: `${at} must be { block, props? }.` });
        return;
      }
      const entry = lookup(section.block);
      if (!entry) {
        errors.push({ field: `${at}.block`, message: `${section.block} is not a registered block.` });
        return;
      }
      if (entry.placement !== "home") {
        errors.push({
          field: `${at}.block`,
          message: `${entry.id} is drawn on every page from settings.${entry.setting?.field}; it is not a home section.`,
        });
        return;
      }
      seen.set(entry.category, (seen.get(entry.category) ?? 0) + 1);
      if (entry.setting && settings && settings[entry.setting.field] !== entry.setting.value) {
        errors.push({
          field: `${at}.block`,
          message: `${entry.id} needs settings.${entry.setting.field} "${entry.setting.value}", the template says "${settings[entry.setting.field]}".`,
        });
      }
      if (entry.status === "placeholder") {
        advisories.push(`${at}: ${entry.id} is a placeholder and renders another variant.`);
      }
      if (entry.props) {
        const check = PROPS_CHECKS[entry.id];
        const messages = check
          ? check(section.props)
          : catalogueProps(input.id, entry.id).some((own) => sameJson(own, section.props))
            ? []
            : [unchangeableProps(entry.id)];
        errors.push(...messages.map((message) => ({ field: `${at}.props`, message })));
      } else if (section.props !== undefined) {
        errors.push({ field: `${at}.props`, message: `${entry.id} takes no props from a template.` });
      }
    });

    if (settings) {
      for (const slot of HOME_SLOTS) {
        const count = seen.get(slot.category) ?? 0;
        const on = settings[slot.field] !== slot.off;
        if (count > 1) {
          errors.push({ field: "sections", message: `${slot.category} appears ${count} times; the slot renders once.` });
        } else if (on && count === 0) {
          errors.push({
            field: "sections",
            message: `settings.${slot.field} is "${settings[slot.field]}" but no ${slot.category} section places it.`,
          });
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as unknown as TemplateManifest, advisories };
}
