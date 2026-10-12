import type * as ApplyModule from "../apply";
import type * as ValidatorsModule from "../../validators";
import type * as SeedValidatorsModule from "../../../seed/validators";

/**
 * The document's `theme.preset` is the catalogue's palette list (t-2026-10-12-33 P1b): a
 * palette the storefront adds and exports needs no backend edit. These cases run on a
 * fixture catalogue, the exported one plus a palette `only-in-catalogue` that no backend
 * file names, and a copy of `long-morning` on it.
 */

const NEW_PALETTE = "only-in-catalogue";

type Loaded = { validators: typeof ValidatorsModule; apply: typeof ApplyModule; seed: typeof SeedValidatorsModule };

function loadWithFixture(): Loaded {
  const actual = jest.requireActual("../catalog.generated.json");
  const base = actual.templates["long-morning"];
  const fixture = {
    ...actual,
    palettes: [...actual.palettes, NEW_PALETTE],
    templates: {
      ...actual.templates,
      "on-new-palette": { ...base, id: "on-new-palette", theme: { ...base.theme, palette: NEW_PALETTE } },
    },
  };
  let loaded!: Loaded;
  jest.isolateModules(() => {
    jest.doMock("../catalog.generated.json", () => fixture);
    loaded = {
      validators: require("../../validators"),
      apply: require("../apply"),
      seed: require("../../../seed/validators"),
    };
  });
  return loaded;
}

const { validators, apply, seed } = loadWithFixture();

const body = (preset: string) => ({
  theme: { preset },
  settings: { defaultMode: "light", header: "h2", hero: "h", tiles: "on", listing: "p4", footer: "f1" },
  content: {
    hero: { title: "", subtitle: "", cta_label: "", cta_href: "", image_url: null },
    products: { source: "popular" },
    order: ["hero", "categories", "products"],
  },
});

describe("the preset list is the catalogue's", () => {
  it("holds a palette only the catalogue knows, and default as medusa", () => {
    expect(validators.THEME_PRESETS).toContain(NEW_PALETTE);
    expect(validators.THEME_PRESETS).toContain("medusa");
    expect(validators.THEME_PRESETS).not.toContain("default");
  });

  it("applies a template on that palette and stores it as the preset", () => {
    const applied = apply.applyTemplate(apply.catalogTemplate("on-new-palette"));
    if (!applied.ok) throw new Error(`the fixture template does not apply: ${JSON.stringify(applied.errors)}`);
    const preset = apply.presetOf(applied.manifest.theme.palette);
    expect(preset).toBe(NEW_PALETTE);
    const document = apply.documentFromTemplate(applied.manifest, preset as string, null, "2026-10-13T00:00:00.000Z");
    expect(document.theme.preset).toBe(NEW_PALETTE);
  });

  it("takes it as an override palette of another template", () => {
    const applied = apply.applyTemplate(apply.catalogTemplate("long-morning"), { palette: NEW_PALETTE });
    expect(applied.ok && apply.presetOf(applied.manifest.theme.palette)).toBe(NEW_PALETTE);
  });

  it("lets PUT /tenants/home and POST /tenants/seed name it", () => {
    expect(validators.PutTenantHomeBody.safeParse(body(NEW_PALETTE)).success).toBe(true);
    expect(seed.PostTenantSeedBody.safeParse({ preset: NEW_PALETTE }).success).toBe(true);
  });

  it("still refuses a palette the catalogue does not hold", () => {
    expect(apply.presetOf("neon")).toBeNull();
    expect(validators.PutTenantHomeBody.safeParse(body("neon")).success).toBe(false);
    expect(seed.PostTenantSeedBody.safeParse({ preset: "neon" }).success).toBe(false);
    const applied = apply.applyTemplate(apply.catalogTemplate("long-morning"), { palette: "neon" });
    expect(applied.ok ? [] : applied.errors.map((error) => error.field)).toEqual(["theme.palette"]);
  });
});
