import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_PROFILE,
  buildProfile,
  loadDotEnv,
  main,
  mediaUrl,
  readLocaleOverrides,
  resolveProfilesDir,
} from "../../../scripts/build-profile.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const STOREFRONT_ROOT = resolve(HERE, "../../..")
const FIXTURES = join(HERE, "../fixtures/profiles")
const GENERATED = join(STOREFRONT_ROOT, "src/lib/profile/profile.generated.json")

describe("build-profile · default fallback", () => {
  it("returns the default profile when the backend profile directory is absent", () => {
    const profile = buildProfile({
      profileId: "sneakers",
      profilesDir: join(FIXTURES, "no-such-directory"),
      mediaBaseUrl: "https://example.test",
    })

    expect(profile.id).toBe("default")
    expect(profile.source).toBe("default")
    expect(profile.home.hero).toBeNull()
    expect(profile.home.categoryTiles).toEqual([])
    expect(profile.home.promoStrip).toBeNull()
    expect(profile.layout.imageTreatment).toBeNull()
    expect(profile.brand).toBeNull()
  })

  it('returns the default profile for the id "default" without touching the disk', () => {
    const profile = buildProfile({
      profileId: "default",
      profilesDir: "/definitely/not/a/path",
      mediaBaseUrl: undefined,
    })
    expect(profile).toMatchObject({ ...DEFAULT_PROFILE })
  })

  it("keeps every profile-driven section switched off in DEFAULT_PROFILE", () => {
    expect(DEFAULT_PROFILE.home.hero).toBeNull()
    expect(DEFAULT_PROFILE.home.categoryTiles).toHaveLength(0)
    expect(DEFAULT_PROFILE.layout.imageTreatment).toBeNull()
  })
})

describe("build-profile · generated shape", () => {
  const profile = buildProfile({
    profileId: "testshop",
    profilesDir: FIXTURES,
    mediaBaseUrl: "https://media.test/testshop/",
  })

  it("reports the backend as its source and keeps the profile id", () => {
    expect(profile.source).toBe("backend")
    expect(profile.id).toBe("testshop")
    expect(profile.schema).toBe("upready.storefront-profile/v0")
  })

  it("narrows the hero to layout, copy, cta and an absolute image url", () => {
    expect(profile.home.hero).toEqual({
      layout: "full-bleed",
      headline: "Built for the long way home",
      subheadline: "Cushioned trail runners for pavement that turns to dirt",
      cta: { label: "Shop the drop", href: "/store" },
      image: "https://media.test/testshop/hero.webp",
      imageDark: "https://media.test/testshop/hero-dark.webp",
    })
  })

  it("carries every category tile with its handle, label and image", () => {
    expect(profile.home.categoryTiles).toHaveLength(4)
    expect(profile.home.categoryTiles[0]).toEqual({
      categoryHandle: "trail-runners",
      label: "Trail runners",
      image: "https://media.test/testshop/tile-trail.webp",
      imageDark: "https://media.test/testshop/tile-trail-dark.webp",
    })
    expect(profile.home.categoryTiles.map((t) => t.categoryHandle)).toEqual([
      "trail-runners",
      "road",
      "recovery-slides",
      "apparel",
    ])
  })

  it("leaves imageDark null wherever the profile authored no dark version", () => {
    // The mode-image pair is optional (`specs/store-profiles/MODE-IMAGE-PAIRS.md`): three
    // of the four fixture tiles have no dark frame, and the storefront then shows `image`
    // in both modes. Null and not undefined, so a consumer reads one shape either way.
    expect(profile.home.categoryTiles.slice(1).map((tile) => tile.imageDark)).toEqual([
      null,
      null,
      null,
    ])
  })

  it("carries the promo strip and the image treatment verbatim", () => {
    expect(profile.home.promoStrip).toEqual({
      enabled: true,
      text: "Free shipping over $120 · 30-day returns",
    })
    expect(profile.layout.imageTreatment).toEqual({
      aspect: "3:4",
      fit: "cover",
      radius: "lg",
      hover: "zoom",
    })
  })

  it("carries the brand so SITE_NAME can fall back to it", () => {
    expect(profile.brand?.name).toBe("Testshop")
  })

  it("emits only the keys the storefront renders", () => {
    expect(Object.keys(profile).sort()).toEqual(
      ["brand", "generatedAt", "home", "i18n", "id", "layout", "schema", "source", "theme"].sort()
    )
  })
})

describe("build-profile · announcement layout", () => {
  // Regression: the narrowing used to read `hero.layout === "split" ? "split" : "full-bleed"`,
  // which silently collapsed ANY third value — "announcement" included — back to full-bleed.
  // A profile author setting the new layout would render the old photo hero and never know.
  it("carries the announcement layout through instead of collapsing it to full-bleed", () => {
    const profile = buildProfile({
      profileId: "testshop-announcement",
      profilesDir: FIXTURES,
      mediaBaseUrl: "https://media.test/testshop/",
    })
    expect(profile.home.hero.layout).toBe("announcement")
  })
})

describe("build-profile · hero switched off", () => {
  const off = buildProfile({
    profileId: "testshop",
    profilesDir: FIXTURES,
    mediaBaseUrl: "https://media.test/testshop/",
    heroEnabled: false,
  })

  it("drops the hero and leaves every other section of the same profile untouched", () => {
    expect(off.home.hero).toBeNull()
    expect(off.home.categoryTiles).toHaveLength(4)
    expect(off.home.promoStrip).not.toBeNull()
    expect(off.layout.imageTreatment).not.toBeNull()
    expect(off.theme).not.toBeNull()
  })

  it("builds the hero as authored when the flag is not passed", () => {
    const on = buildProfile({
      profileId: "testshop",
      profilesDir: FIXTURES,
      mediaBaseUrl: "https://media.test/testshop/",
    })
    expect(on.home.hero).not.toBeNull()
  })
})

describe("build-profile · locale overrides", () => {
  it("picks up home.promoStrip.text per locale and ignores files without one", () => {
    const overrides = readLocaleOverrides(join(FIXTURES, "testshop"))
    expect(overrides.de).toEqual({
      promoStrip: "Kostenloser Versand ab 120 $ · 30 Tage Rueckgaberecht",
    })
    // fr.json exists but carries no promo text, so the locale falls back to English.
    expect(overrides.fr).toBeUndefined()
  })

  it("returns nothing when the profile has no i18n directory", () => {
    expect(readLocaleOverrides(join(FIXTURES, "no-such-directory"))).toEqual({})
  })
})

describe("build-profile · media urls", () => {
  // "media/" names a directory inside the PROFILE, not one on the media host: the up
  // script copies the files flat into static/store-profiles/<id>/ and the backend seed
  // drops the segment when it prefixes. The storefront has to agree or the hero and the
  // category tiles 404 while the product images on the same page load.
  it("prefixes a relative ref with the configured base, dropping the media/ segment", () => {
    expect(mediaUrl("media/hero.webp", "https://cdn.test/p")).toBe(
      "https://cdn.test/p/hero.webp"
    )
  })

  it("collapses duplicated slashes at the join", () => {
    expect(mediaUrl("/media/hero.webp", "https://cdn.test/p/")).toBe(
      "https://cdn.test/p/hero.webp"
    )
  })

  it("keeps an already absolute url untouched", () => {
    expect(mediaUrl("https://cdn.test/hero.webp", "https://other.test")).toBe(
      "https://cdn.test/hero.webp"
    )
  })

  it("falls back to the storefront's own origin when no base is configured", () => {
    expect(mediaUrl("media/hero.webp", undefined)).toBe("/media/hero.webp")
  })
})

describe("build-profile · environment", () => {
  it("resolves the profiles directory against the storefront root by default", () => {
    expect(resolveProfilesDir({})).toBe(
      resolve(STOREFRONT_ROOT, "../backend/src/migration-scripts/data/profiles")
    )
  })

  it("honours an absolute STORE_PROFILES_DIR", () => {
    expect(resolveProfilesDir({ STORE_PROFILES_DIR: "/abs/profiles" })).toBe("/abs/profiles")
  })

  it("reads NEXT_PUBLIC_STORE_PROFILE out of .env.local without overriding a real env var", () => {
    const root = mkdtempSync(join(tmpdir(), "build-profile-env-"))
    writeFileSync(join(root, ".env.local"), "NEXT_PUBLIC_STORE_PROFILE=sneakers\n")

    try {
      const fromFile = loadDotEnv({}, root)
      expect(fromFile.NEXT_PUBLIC_STORE_PROFILE).toBe("sneakers")
      const fromEnv = loadDotEnv({ NEXT_PUBLIC_STORE_PROFILE: "explicit" }, root)
      expect(fromEnv.NEXT_PUBLIC_STORE_PROFILE).toBe("explicit")
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})

describe("build-profile · main() writes the file", () => {
  let previous

  beforeAll(() => {
    previous = existsSync(GENERATED) ? readFileSync(GENERATED, "utf8") : null
  })

  afterAll(() => {
    if (previous !== null) writeFileSync(GENERATED, previous)
  })

  it("writes the fixture profile to src/lib/profile/profile.generated.json", () => {
    main({
      NEXT_PUBLIC_STORE_PROFILE: "testshop",
      STORE_PROFILES_DIR: FIXTURES,
      STORE_MEDIA_BASE_URL: "https://media.test/testshop",
      SKIP_THEME_BUILD: "1",
    })

    const written = JSON.parse(readFileSync(GENERATED, "utf8"))
    expect(written.id).toBe("testshop")
    expect(written.source).toBe("backend")
    expect(written.home.categoryTiles).toHaveLength(4)
    expect(written.layout.imageTreatment.aspect).toBe("3:4")
    expect(written.i18n.de.promoStrip).toContain("Kostenloser Versand")
  })

  it("writes a null hero when STORE_PROFILE_HERO=off", () => {
    main({
      NEXT_PUBLIC_STORE_PROFILE: "testshop",
      STORE_PROFILES_DIR: FIXTURES,
      STORE_MEDIA_BASE_URL: "https://media.test/testshop",
      STORE_PROFILE_HERO: "off",
      SKIP_THEME_BUILD: "1",
    })

    const written = JSON.parse(readFileSync(GENERATED, "utf8"))
    expect(written.home.hero).toBeNull()
    expect(written.home.categoryTiles).toHaveLength(4)
  })
})
