import { afterEach, describe, expect, it, vi } from "vitest"

import { PROFILE_DEFAULTS } from "@lib/theme/composition"
import { LIGHT_ONLY_THEME_IDS } from "@lib/theme/presets.generated"
import { blockById } from "@modules/blocks/registry"

import { TEMPLATE_SOURCES, getTemplate } from "./catalog"
import { TEMPLATE_SCHEMA, resolveTemplate, templateText, validateTemplate } from "./manifest"
import { TEMPLATE_PREVIEW_HEADER, applyTemplatePreview } from "./preview-header"

// The registry reaches `server-only` loaders through the header and footer variants. Hoisted by vitest.
vi.mock("server-only", () => ({}))

/** A valid manifest to break one field at a time. */
const base = () => ({
  schema: TEMPLATE_SCHEMA,
  id: "probe",
  title: "Probe",
  description: "A template for the validator's tests.",
  settings: { ...PROFILE_DEFAULTS["home-goods"], footer: "f1" },
  theme: {
    palette: "home-goods",
    fontPair: { display: "Fraunces", body: "Manrope" },
    radius: "soft",
    buttonStyle: "filled",
    photoStyle: "landscape",
    density: "spacious",
  },
  sections: [{ block: "hero/h" }, { block: "tiles/on" }, { block: "listing/p4" }] as {
    block: string
    props?: unknown
  }[],
})

const check = (input: unknown) => validateTemplate(input, blockById)
const messages = (input: unknown) => {
  const result = check(input)
  return result.ok ? [] : result.errors.map((e) => `${e.field}: ${e.message}`)
}

describe("the templates of this branch", () => {
  it.each(Object.keys(TEMPLATE_SOURCES))("%s is valid and resolves", (id) => {
    const result = check(TEMPLATE_SOURCES[id])
    expect(result.ok ? [] : result.errors).toEqual([])
    expect(getTemplate(id)?.manifest.id).toBe(id)
  })

  it("the two differ in every style layer", () => {
    const a = getTemplate("long-morning")!.manifest.theme
    const b = getTemplate("ferrite")!.manifest.theme
    for (const layer of ["palette", "radius", "buttonStyle", "photoStyle", "density"] as const) {
      expect(a[layer], layer).not.toBe(b[layer])
    }
    expect(a.fontPair).not.toEqual(b.fontPair)
  })

  it("both get their own font pair, Cyrillic included (lead's answer to T0a)", () => {
    expect(getTemplate("long-morning")!.fonts).toEqual({
      display: "Cormorant Garamond",
      body: "Manrope",
      loaded: true,
      pair: "Cormorant Garamond|Manrope",
    })
    expect(getTemplate("ferrite")!.fonts).toEqual({
      display: "IBM Plex Mono",
      body: "IBM Plex Sans",
      loaded: true,
      pair: "IBM Plex Mono|IBM Plex Sans",
    })
  })

  it("long-morning places the new text bar first", () => {
    expect(getTemplate("long-morning")!.manifest.sections[0].block).toBe("announcement/text-bar")
  })

  // P2b: the panel shows these to the owner, in the owner's language and plain words (rule 18e).
  it.each(Object.keys(TEMPLATE_SOURCES))("%s names itself and says what it is for in Russian and English", (id) => {
    const { title, description } = TEMPLATE_SOURCES[id] as { title: unknown; description: unknown }
    for (const text of [title, description]) {
      expect(text, id).toMatchObject({ ru: expect.any(String), en: expect.any(String) })
      const { ru, en } = text as { ru: string; en: string }
      expect(ru.trim() && en.trim(), id).toBeTruthy()
      expect(ru, `${id}: Russian is Cyrillic`).toMatch(/[а-яё]/i)
    }
    // One sentence, no internal names: header, hero, listing and footer variants, profiles, fonts.
    const { ru, en } = description as { ru: string; en: string }
    for (const line of [ru, en]) {
      expect(line, id).not.toMatch(/\b[a-z]\d\b|profile|профил|Garamond|Manrope|Plex/i)
      expect(line.split(/[.!?](?:\s|$)/).filter((part) => part.trim()).length, `${id}: one sentence`).toBe(1)
    }
  })
})

describe("validateTemplate", () => {
  it("accepts the base manifest", () => {
    expect(messages(base())).toEqual([])
  })

  it("refuses another schema", () => {
    expect(messages({ ...base(), schema: "upready.storefront-template/v0" })).toEqual([
      `schema: schema must be "${TEMPLATE_SCHEMA}".`,
    ])
  })

  it("applies the composition's FORBIDDEN pairs (header h4 with hero k)", () => {
    const input = base()
    input.settings = { ...input.settings, header: "h4", hero: "k" }
    input.sections[0] = { block: "hero/k" }
    const result = check(input)
    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.forbidden?.field).toBe("header")
  })

  it("surfaces the composition's ADVISORY pairs without refusing", () => {
    const input = base()
    input.settings = { ...input.settings, hero: "ga" }
    input.sections[0] = { block: "hero/ga" }
    const result = check(input)
    expect(result.ok).toBe(true)
    expect(result.ok ? result.advisories.join() : "").toMatch(/settings\.hero/)
  })

  it("refuses a block the registry does not know", () => {
    const input = base()
    input.sections.push({ block: "hero/zz" })
    expect(messages(input)).toEqual(["sections[3].block: hero/zz is not a registered block."])
  })

  it("refuses header and footer as home sections", () => {
    const input = base()
    input.sections.unshift({ block: "header/h2" })
    expect(messages(input)[0]).toMatch(/header\/h2 is drawn on every page from settings\.header/)
  })

  it("holds sections and settings in step", () => {
    const input = base()
    input.sections[0] = { block: "hero/g" }
    expect(messages(input)).toEqual([
      'sections[0].block: hero/g needs settings.hero "g", the template says "h".',
    ])
  })

  it("refuses a slot the settings turn on but no section places", () => {
    const input = base()
    input.sections = input.sections.filter((s) => s.block !== "tiles/on")
    expect(messages(input)).toEqual(['sections: settings.tiles is "on" but no tiles section places it.'])
  })

  it("refuses a slot twice", () => {
    const input = base()
    input.sections.push({ block: "listing/p4" })
    expect(messages(input)).toEqual(["sections: listing appears 2 times; the slot renders once."])
  })

  it("checks a block's props with the block's own parser", () => {
    const input = base()
    input.sections.unshift({ block: "announcement/text-bar", props: { text: { xx: "?" }, href: "javascript:0" } })
    expect(messages(input)).toEqual([
      "sections[0].props: text.xx: not a language of i18n/config.ts",
      "sections[0].props: href must start with / or https://",
    ])
  })

  it("refuses props on a block that takes none", () => {
    const input = base()
    input.sections[0] = { block: "hero/h", props: { title: "x" } }
    expect(messages(input)).toEqual(["sections[0].props: hero/h takes no props from a template."])
  })

  it("takes a hero written for templates in the hero's place when settings turn the composition hero off", () => {
    const input = base()
    input.settings = { ...input.settings, hero: "none" }
    input.sections[0] = { block: "hero/split", props: blockById("hero/split")!.fixtures!.sample }
    expect(messages(input)).toEqual([])
  })

  it("refuses it while settings still choose a composition hero, and beside one", () => {
    const named = base()
    named.sections[0] = { block: "hero/split", props: { title: { ru: "Свежий хлеб" } } }
    expect(messages(named)).toEqual([
      'sections[0].block: hero/split takes the hero slot itself and needs settings.hero "none", the template says "h".',
    ])

    const twice = base()
    twice.sections.unshift({ block: "hero/split", props: { title: { ru: "Свежий хлеб" } } })
    expect(messages(twice)).toEqual([
      'sections[0].block: hero/split takes the hero slot itself and needs settings.hero "none", the template says "h".',
      "sections: hero appears 2 times; the slot renders once.",
    ])
  })

  it("refuses a style layer outside its list", () => {
    const input = base()
    input.theme = { ...input.theme, palette: "neon", radius: "huge" }
    expect(messages(input)).toEqual([
      expect.stringMatching(/^theme\.palette: theme\.palette must be one of: default, electronics/),
      "theme.radius: theme.radius must be one of: sharp, soft, round, pill.",
    ])
  })

  it.each([...LIGHT_ONLY_THEME_IDS])("takes the lab palette %s with a light default", (palette) => {
    const input = base()
    input.theme = { ...input.theme, palette }
    expect(messages(input)).toEqual([])
  })

  it("refuses a light-only palette with a dark default", () => {
    const input = base()
    input.settings = { ...input.settings, defaultMode: "dark" }
    input.theme = { ...input.theme, palette: "ferma" }
    expect(messages(input)).toEqual([
      'settings.defaultMode: theme.palette "ferma" has no dark mode; settings.defaultMode must be "light".',
    ])
  })
})

describe("templateText", () => {
  it("is the page's language, else English, else any line given", () => {
    const text = { ru: "Долгое утро", en: "Long Morning" }
    expect(templateText(text, "ru")).toBe("Долгое утро")
    expect(templateText(text, "en")).toBe("Long Morning")
    expect(templateText(text, "de")).toBe("Long Morning")
    expect(templateText({ ru: "Долгое утро" }, "de")).toBe("Долгое утро")
  })

  it("reads a string as the same words in every language", () => {
    expect(templateText("Long Morning", "ru")).toBe("Long Morning")
  })
})

describe("resolveTemplate", () => {
  it("is the settings, the data-theme preset, the mode and the layer variables", () => {
    const result = check(base())
    if (!result.ok) throw new Error("base must be valid")
    const resolved = resolveTemplate(result.value)
    expect(resolved.settings).toEqual(base().settings)
    expect(resolved.preset).toBe("home-goods")
    expect(resolved.mode).toBe("light")
    expect(resolved.style).toEqual({
      "--radius": "0.375rem",
      "--layer-button-bg": "var(--primary)",
      "--layer-button-fg": "var(--primary-foreground)",
      "--layer-button-border": "var(--primary)",
      "--layer-photo-aspect": "4 / 3",
      "--layer-density": "1.25",
      "--layer-section-gap": "4.5rem",
    })
    // This build loads no profile font pair (`fonts.generated.ts`), and Fraunces has no
    // template file (no Cyrillic, `public/fonts/templates/LICENSES.md`), so none is loaded.
    expect(resolved.fonts).toEqual({ display: "Fraunces", body: "Manrope", loaded: false, pair: null })
  })

  const resolveWith = (fontPair: { display: string; body: string }) => {
    const input = base()
    input.theme = { ...input.theme, fontPair }
    const result = check(input)
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "))
    return resolveTemplate(result.value)
  }

  it("sets data-font-pair and loads a pair whose two families have files", () => {
    expect(resolveWith({ display: "Playfair Display", body: "Manrope" }).fonts).toEqual({
      display: "Playfair Display",
      body: "Manrope",
      loaded: true,
      pair: "Playfair Display|Manrope",
    })
    expect(resolveWith({ display: "IBM Plex Sans", body: "IBM Plex Sans" }).fonts.pair).toBe("IBM Plex Sans|IBM Plex Sans")
  })

  it("leaves data-font-pair unset when one family has no file", () => {
    const fonts = resolveWith({ display: "Space Grotesk", body: "IBM Plex Sans" }).fonts
    expect(fonts.pair).toBeNull()
    expect(fonts.loaded).toBe(false)
  })
})

describe("the preview switch", () => {
  afterEach(() => vi.unstubAllEnvs())
  const url = (search: string) => new URL(`https://shop.test/ru${search}`)

  it("without STOREFRONT_TEMPLATE_PREVIEW deletes the header and writes none", () => {
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "")
    const headers = new Headers({ [TEMPLATE_PREVIEW_HEADER]: "ferrite" })
    applyTemplatePreview(url("?template=ferrite"), headers)
    expect(headers.get(TEMPLATE_PREVIEW_HEADER)).toBeNull()
  })

  it("with it writes a well-formed id from ?template and nothing else", () => {
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    const headers = new Headers({ [TEMPLATE_PREVIEW_HEADER]: "sent-by-visitor" })
    applyTemplatePreview(url("?template=ferrite"), headers)
    expect(headers.get(TEMPLATE_PREVIEW_HEADER)).toBe("ferrite")

    const bad = new Headers()
    applyTemplatePreview(url("?template=../etc"), bad)
    expect(bad.get(TEMPLATE_PREVIEW_HEADER)).toBeNull()
  })
})

describe("getPreviewTemplate", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock("next/headers")
    vi.resetModules()
  })

  const withHeader = (value: string | null) =>
    vi.doMock("next/headers", () => ({
      headers: async () => ({ get: () => value }),
    }))

  it("is null without the flag, whatever the request says", async () => {
    withHeader("ferrite")
    const { getPreviewTemplate } = await import("./preview")
    expect(await getPreviewTemplate()).toBeNull()
  })

  it("is the named template with the flag", async () => {
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    withHeader("ferrite")
    const { getPreviewTemplate } = await import("./preview")
    expect((await getPreviewTemplate())?.preset).toBe("electronics")
  })

  it("is null with the flag for an unknown template", async () => {
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    withHeader("nope")
    const { getPreviewTemplate } = await import("./preview")
    expect(await getPreviewTemplate()).toBeNull()
  })
})
