import { readFileSync } from "node:fs";
import path from "node:path";

import { LOCALE_CODES } from "../../../locale-settings/validators";
import { THEME_PRESETS, type TenantHomeDocument } from "../../validators";
import {
  applyTemplate,
  carryTemplateOver,
  catalogTemplate,
  documentFromTemplate,
  manifestOf,
  presetOf,
} from "../apply";
import { CATALOG, validateTemplate, type TemplateManifest } from "../validation";
import { PostTenantHomeTemplateBody } from "../validators";

/**
 * The template half of the tenant home document (t-2026-10-12-33): the backend's copy of
 * the template validator, the overrides `POST /tenants/home/template` takes, the document
 * it writes, and what a plain `PUT /tenants/home` keeps of it. The route itself, with its
 * auth and scoping, is `integration-tests/http/tenants-home-template.spec.ts`.
 */

type Case = {
  name: string;
  input?: unknown;
  set?: Record<string, unknown>;
  delete?: string[];
  errors: string[];
};

/** The storefront's fixture set: `parity.test.ts` there runs both copies on it. */
const FIXTURES = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../../../storefront/src/lib/templates/parity.fixtures.json"),
    "utf8",
  ),
) as { base: Record<string, unknown>; cases: Case[] };

function inputOf(fixture: Case): unknown {
  if ("input" in fixture) return fixture.input;
  const value = JSON.parse(JSON.stringify(FIXTURES.base)) as Record<string, unknown>;
  const walk = (at: string) => {
    const keys = at.split(".");
    const last = keys.pop() as string;
    let node: Record<string, unknown> = value;
    for (const key of keys) node = node[key] as Record<string, unknown>;
    return { node, last };
  };
  for (const [at, next] of Object.entries(fixture.set ?? {})) {
    const { node, last } = walk(at);
    node[last] = next;
  }
  for (const at of fixture.delete ?? []) {
    const { node, last } = walk(at);
    delete node[last];
  }
  return value;
}

const verdict = (input: unknown) => {
  const result = validateTemplate(input);
  return result.ok ? [] : result.errors.map((error) => `${error.field}: ${error.message}`);
};

const longMorning = () => catalogTemplate("long-morning") as TemplateManifest;

const previousDocument = (): TenantHomeDocument => ({
  schema: "upready.tenant-home/v1",
  theme: { preset: "sneakers" },
  settings: { defaultMode: "dark", header: "h5", hero: "k", tiles: "on", listing: "p1", footer: "f3" },
  content: {
    hero: { title: "Own title", subtitle: "Own words", cta_label: "Go", cta_href: "/store", image_url: null },
    products: { source: "category", category_id: "pcat_1", title: "Honey" },
    order: ["products", "hero"],
    banners: [],
  },
  updatedAt: "2026-10-12T00:00:00.000Z",
});

describe("the template validator's backend copy", () => {
  it.each(FIXTURES.cases.map((fixture) => [fixture.name, fixture] as const))("%s", (_name, fixture) => {
    expect(verdict(inputOf(fixture))).toEqual(fixture.errors);
  });

  it("validates every template of the catalogue", () => {
    expect(Object.keys(CATALOG.templates).length).toBeGreaterThan(0);
    for (const id of Object.keys(CATALOG.templates)) {
      expect([id, verdict(CATALOG.templates[id])]).toEqual([id, []]);
    }
  });

  it("reads the vocabularies the document already holds by hand", () => {
    // Every preset the document stores is a palette of the catalogue; the catalogue may hold more.
    expect(THEME_PRESETS.filter((id) => !CATALOG.palettes.includes(id))).toEqual([]);
    expect(CATALOG.locales).toEqual([...LOCALE_CODES]);
  });
});

describe("applying a template", () => {
  it("expands it into settings, preset, layers, sections and provenance, keeping the shop's content", () => {
    const applied = applyTemplate(longMorning());
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const document = documentFromTemplate(applied.manifest, "home-goods", previousDocument(), "2026-10-13T00:00:00.000Z");
    expect(document.settings).toEqual(longMorning().settings);
    expect(document.theme).toEqual({
      preset: "home-goods",
      layers: { radius: "soft", buttonStyle: "filled", photoStyle: "landscape", density: "spacious" },
    });
    expect(document.content.sections).toEqual(longMorning().sections);
    expect(document.template).toEqual({
      id: "long-morning",
      schema: "upready.storefront-template/v1",
      fontPair: longMorning().theme.fontPair,
    });
    const { sections: _sections, ...content } = document.content;
    expect(content).toEqual(previousDocument().content);
  });

  it("gives a shop with no document the panel's empty content", () => {
    const applied = applyTemplate(longMorning());
    if (!applied.ok) throw new Error("long-morning is valid");
    const document = documentFromTemplate(applied.manifest, "home-goods", null, "2026-10-13T00:00:00.000Z");
    expect(document.content.order).toEqual(["hero", "categories", "products"]);
    expect(document.content.products).toEqual({ source: "popular" });
    expect(document.content.hero.title).toBe("");
  });

  it("takes the palette, a layer and a section's props from the owner", () => {
    const applied = applyTemplate(longMorning(), {
      palette: "electronics",
      layers: { radius: "pill" },
      sections: [{ index: 0, block: "announcement/text-bar", props: { text: { ru: "Привет" } } }],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.manifest.theme.palette).toBe("electronics");
    expect(applied.manifest.theme.radius).toBe("pill");
    expect(applied.manifest.theme.density).toBe("spacious");
    expect(applied.manifest.sections[0]).toEqual({ block: "announcement/text-bar", props: { text: { ru: "Привет" } } });
    expect(applied.manifest.sections.slice(1)).toEqual(longMorning().sections.slice(1));
  });

  it("refuses props the block refuses, a palette outside the presets and a section that is not there", () => {
    const badProps = applyTemplate(longMorning(), {
      sections: [{ index: 0, block: "announcement/text-bar", props: { text: { xx: "Hi" } } }],
    });
    expect(badProps.ok ? [] : badProps.errors.map((e) => e.field)).toEqual(["sections[0].props"]);

    const palette = applyTemplate(longMorning(), { palette: "neon" });
    expect(palette.ok ? [] : palette.errors.map((e) => e.field)).toEqual(["theme.palette"]);

    const missing = applyTemplate(longMorning(), {
      sections: [
        { index: 9, block: "hero/h", props: {} },
        { index: 1, block: "announcement/text-bar", props: {} },
      ],
    });
    expect(missing.ok ? [] : missing.errors.map((e) => e.field)).toEqual([
      "overrides.sections[0].index",
      "overrides.sections[1].block",
    ]);
  });

  it("cannot give a block without props parser any props", () => {
    const applied = applyTemplate(longMorning(), { sections: [{ index: 1, block: "hero/h", props: { title: "x" } }] });
    expect(applied.ok ? [] : applied.errors.map((e) => e.message)).toEqual(["hero/h takes no props from a template."]);
  });

  it("answers a FORBIDDEN pair with the rule, never a document", () => {
    const source = { ...longMorning(), settings: { ...longMorning().settings, footer: "f6", defaultMode: "dark" } };
    const applied = applyTemplate(source);
    expect(applied.ok).toBe(false);
    expect(applied.ok ? null : applied.forbidden?.field).toBe("footer");
  });

  it("stores the default palette as medusa, the preset themes.css paints it with", () => {
    expect(presetOf("default")).toBe("medusa");
    expect(presetOf("home-goods")).toBe("home-goods");
    expect(presetOf("neon")).toBeNull();
  });

  it("knows only the catalogue's ids", () => {
    expect(catalogTemplate("ferrite")).not.toBeNull();
    expect(catalogTemplate("toString")).toBeNull();
    expect(catalogTemplate("nope")).toBeNull();
  });
});

describe("the request body", () => {
  const parse = (body: unknown) => PostTenantHomeTemplateBody.safeParse(body).success;

  it("takes an id and the three kinds of override", () => {
    expect(parse({ id: "long-morning" })).toBe(true);
    expect(
      parse({
        id: "long-morning",
        overrides: {
          palette: "geist",
          layers: { radius: "round", density: "compact" },
          sections: [{ index: 0, block: "announcement/text-bar", props: { text: { en: "Hi" } } }],
        },
      }),
    ).toBe(true);
  });

  it("refuses an override of anything else", () => {
    expect(parse({ id: "long-morning", overrides: { settings: { header: "h4" } } })).toBe(false);
    expect(parse({ id: "long-morning", overrides: { layers: { radius: "huge" } } })).toBe(false);
    expect(parse({ id: "long-morning", overrides: { layers: { fontPair: "Inter" } } })).toBe(false);
    expect(parse({ id: "long-morning", overrides: { sections: [{ index: 0, block: "hero/h" }] } })).toBe(false);
    expect(parse({ id: "long-morning", sections: [{ block: "hero/zz" }] })).toBe(false);
  });
});

describe("a plain PUT /tenants/home after a template", () => {
  const saved = (): TenantHomeDocument => {
    const applied = applyTemplate(longMorning());
    if (!applied.ok) throw new Error("long-morning is valid");
    return documentFromTemplate(applied.manifest, "home-goods", previousDocument(), "2026-10-13T00:00:00.000Z");
  };
  const blocks = (carried: ReturnType<typeof carryTemplateOver>) =>
    carried.carried?.sections.map((section) => section.block) ?? null;

  it("carries nothing for a shop with no template", () => {
    expect(carryTemplateOver(previousDocument(), { settings: previousDocument().settings, preset: "sneakers" })).toEqual({
      carried: null,
    });
    expect(carryTemplateOver(null, { settings: previousDocument().settings, preset: "sneakers" })).toEqual({ carried: null });
  });

  it("keeps the template as it was when the settings are the same", () => {
    const carried = carryTemplateOver(saved(), { settings: saved().settings, preset: "home-goods" });
    expect(carried.carried).toEqual({
      template: saved().template,
      layers: saved().theme.layers,
      sections: saved().content.sections,
    });
  });

  it("lets a slot section follow the settings: renamed, dropped, appended", () => {
    const settings = saved().settings;
    expect(blocks(carryTemplateOver(saved(), { settings: { ...settings, hero: "g" }, preset: "geist" }))).toEqual([
      "announcement/text-bar",
      "hero/g",
      "tiles/on",
      "listing/p4",
    ]);
    expect(blocks(carryTemplateOver(saved(), { settings: { ...settings, listing: "none" }, preset: "geist" }))).toEqual([
      "announcement/text-bar",
      "hero/h",
      "tiles/on",
    ]);

    const tilesOff = carryTemplateOver(saved(), { settings: { ...settings, tiles: "off" }, preset: "geist" });
    const document = { ...saved(), settings: { ...settings, tiles: "off" as const } };
    document.content = { ...document.content, sections: tilesOff.carried?.sections };
    expect(blocks(carryTemplateOver(document, { settings, preset: "geist" }))).toEqual([
      "announcement/text-bar",
      "hero/h",
      "listing/p4",
      "tiles/on",
    ]);
  });

  it("drops a template that no longer validates, with the reason", () => {
    const broken = saved();
    broken.content = { ...broken.content, sections: [{ block: "hero/zz" }, ...(broken.content.sections ?? [])] };
    const carried = carryTemplateOver(broken, { settings: broken.settings, preset: "home-goods" });
    expect(carried.carried).toBeNull();
    expect(carried.reason).toContain("hero/zz is not a registered block.");
  });

  it("reads the saved template back as the manifest it came from", () => {
    const manifest = manifestOf(saved());
    expect(manifest?.sections).toEqual(longMorning().sections);
    expect(manifest?.theme).toEqual(longMorning().theme);
    expect(manifest?.settings).toEqual(longMorning().settings);
    expect(manifestOf(previousDocument())).toBeNull();
  });
});
