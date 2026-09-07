import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { FONT_NAMES } from "./fonts"

/**
 * The claim these tests exist for: only the ACTIVE profile's pair reaches the bundle.
 * That cannot be asserted by reading fonts.ts, because fonts.ts deliberately calls
 * nothing — the guarantee lives in the generator. So run the generator against fixture
 * profiles and read what it emitted.
 */

const SF = join(__dirname, "../../..")
const SCRIPT = join(SF, "scripts/build-themes.mjs")

function generate(profile: unknown | null): string {
  const dir = mkdtempSync(join(tmpdir(), "theme-fonts-"))
  const profilePath = join(dir, "profile.json")
  if (profile !== null) writeFileSync(profilePath, JSON.stringify(profile))
  execFileSync("node", [SCRIPT], {
    cwd: SF,
    stdio: "pipe",
    env: { ...process.env, THEME_PROFILE_JSON: profilePath, THEME_OUT_DIR: dir },
  })
  return readFileSync(join(dir, "fonts.generated.ts"), "utf8")
}

const withFonts = (display: string, body: string) => ({
  theme: { presetId: "medusa", defaultMode: "light", typography: { display, body } },
})

describe("the generated font module", () => {
  it("instantiates exactly the two families the profile names, and no others", () => {
    const out = generate(withFonts("Sora", "Inter"))
    expect(out).toContain('import { Sora, Inter } from "next/font/google"')
    expect(out).toContain('const display = Sora({ subsets: ["latin"], display: "swap", variable: "--font-display" })')
    expect(out).toContain('const body = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body" })')
    // the ten that were not asked for must not appear at all: a loader call is a
    // build-time download plus an injected stylesheet, whether or not it is used
    const loaderCalls = out.match(/^const \w+ = \w+\(/gm) ?? []
    expect(loaderCalls).toHaveLength(2)
    for (const name of FONT_NAMES) {
      if (name === "Sora" || name === "Inter") continue
      expect(out, `${name} must not be instantiated`).not.toContain(name.replace(/ /g, "_"))
    }
  })

  it("adds the explicit weight a family with no variable axis needs", () => {
    const out = generate(withFonts("Playfair Display", "IBM Plex Mono"))
    expect(out).toContain('import { Playfair_Display, IBM_Plex_Mono } from "next/font/google"')
    expect(out).toContain('variable: "--font-display" }') // variable family: no weight
    expect(out).toContain('weight: ["400", "500", "600", "700"] })')
  })

  it("emits one import when both roles ask for the same family", () => {
    const out = generate(withFonts("Geist", "Geist"))
    expect(out).toContain('import { Geist } from "next/font/google"')
    expect(out.match(/^const \w+ = \w+\(/gm) ?? []).toHaveLength(2)
  })

  it("instantiates nothing when the profile is absent", () => {
    const out = generate(null)
    expect(out).toContain('export const fontClassName = ""')
    expect(out).not.toContain("next/font/google")
  })

  it("instantiates nothing when the profile names no typography", () => {
    const out = generate({ theme: { presetId: "medusa", defaultMode: "light" } })
    expect(out).toContain('export const fontClassName = ""')
    expect(out).not.toContain("next/font/google")
  })

  it("fails the build on a family outside the allow-list, naming it", () => {
    let message = ""
    try {
      generate(withFonts("Comic Sans MS", "Inter"))
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer; stdout?: Buffer }
      message = String(err.stderr ?? "") + String(err.stdout ?? "")
      expect(err.status, "the generator must exit non-zero").not.toBe(0)
    }
    expect(message, "a rejected font must not fail silently").toContain("Comic Sans MS")
    expect(message).toContain("not one of the twelve allow-listed fonts")
  })
})
