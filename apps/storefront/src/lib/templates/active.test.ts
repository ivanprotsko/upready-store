import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TenantHome } from "@lib/data/tenant-home"

import { TEMPLATE_SOURCES, getTemplate } from "./catalog"
import type { TemplateManifest } from "./manifest"
import { resolveSavedTemplate } from "./saved"

// The registry reaches `server-only` loaders through the header and footer variants. Hoisted by vitest.
vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({
  home: null as unknown,
  headers: new Map<string, string>(),
}))

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}))
vi.mock("@lib/data/tenant-home", () => ({ getTenantHome: async () => state.home }))

/**
 * The document `POST /tenants/home/template` writes for a template with no overrides
 * (`apps/backend/src/api/tenants/home/template/apply.ts`, `documentFromTemplate`): the
 * template's settings, palette and layers, its sections and its provenance, over the
 * shop's own content.
 */
function savedDocument(id: string): TenantHome {
  const manifest = TEMPLATE_SOURCES[id] as TemplateManifest
  const { palette, fontPair, ...layers } = manifest.theme
  return {
    schema: "upready.tenant-home/v1",
    theme: { preset: palette, layers },
    settings: manifest.settings,
    content: {
      hero: { title: "Own title", subtitle: "", cta_label: "", cta_href: "", image_url: null },
      products: { source: "popular" },
      order: ["products", "hero"],
      banners: [],
      sections: manifest.sections,
    },
    template: { id, schema: manifest.schema, fontPair },
    updatedAt: "2026-10-13T00:00:00.000Z",
  }
}

describe("a template the shop saved", () => {
  it.each(Object.keys(TEMPLATE_SOURCES))("%s resolves to what its preview resolves to", (id) => {
    const saved = resolveSavedTemplate(savedDocument(id))
    const preview = getTemplate(id)
    expect(saved).not.toBeNull()
    expect(preview).not.toBeNull()
    expect(saved!.preset).toBe(preview!.preset)
    expect(saved!.mode).toBe(preview!.mode)
    expect(saved!.style).toEqual(preview!.style)
    expect(saved!.settings).toEqual(preview!.settings)
    expect(saved!.manifest.sections).toEqual(preview!.manifest.sections)
    expect(saved!.fonts).toEqual(preview!.fonts)
  })

  it("is nothing on a document with no template", () => {
    const { template: _t, ...plain } = savedDocument("long-morning")
    expect(resolveSavedTemplate(plain)).toBeNull()
  })

  it("is nothing, logged once, when what it saved no longer validates", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const gone = savedDocument("ferrite")
    gone.content = { ...gone.content, sections: [{ block: "hero/zz" }, ...(gone.content.sections ?? [])] }
    expect(resolveSavedTemplate(gone)).toBeNull()
    const renamed = savedDocument("ferrite")
    renamed.theme = { ...renamed.theme, layers: { ...renamed.theme.layers!, radius: "huge" } }
    expect(resolveSavedTemplate(renamed)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe("getActiveTemplate", () => {
  beforeEach(() => {
    state.home = null
    state.headers = new Map()
    vi.unstubAllEnvs()
  })
  afterEach(() => vi.unstubAllEnvs())

  const active = async () => (await import("./active")).getActiveTemplate()

  it("is null for a shop with no template", async () => {
    expect(await active()).toBeNull()
    const { template: _t, ...plain } = savedDocument("long-morning")
    state.home = plain
    expect(await active()).toBeNull()
  })

  it("is the saved template when there is no preview", async () => {
    state.home = savedDocument("long-morning")
    expect((await active())?.manifest.id).toBe("long-morning")
  })

  it("puts the stand's preview ahead of the saved one", async () => {
    state.home = savedDocument("long-morning")
    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    state.headers.set("x-template-preview", "ferrite")
    expect((await active())?.manifest.id).toBe("ferrite")
  })
})
