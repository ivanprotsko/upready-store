"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

import { applyAxis, readCurrent, resetAxes } from "@lib/theme/apply"
import { profile } from "@lib/profile"
import {
  THEME_IDS,
  THEME_LABELS,
  THEME_MODES,
  THEME_TOKEN_COUNT,
} from "@lib/theme/presets.generated"
import {
  PROFILE_DEFAULTS,
  isForbidden,
  type FieldError,
  type ForbiddenRule,
  type Mode,
  type ProfileId,
  type StorefrontSettings,
  type StorefrontSettingsInput,
} from "@lib/theme/composition"

import { CheckIcon, CloseIcon } from "./icons"
import { CompositionRows, type RowField } from "./composition-rows"
import { SaveBar, type SaveState } from "./save-bar"

/**
 * The popover's contents: preset, mode, the source line, reset and lock.
 *
 * Every switch goes through src/lib/theme and nothing else — applyAxis() writes the
 * attribute on <html> and persists it, resetAxes() drops both. No axis is added today
 * (rule 32a); when T0j/T0k register `data-card` and `data-image-*` in AXES, this file
 * gains a section, not a mechanism.
 *
 * It mounts on the first click rather than with the button, and that is not a
 * lazy-loading trick: the state is read LIVE off <html>, which on the server is the
 * profile default and in the browser is whatever the visitor chose, so a component that
 * rendered in both places would disagree with itself at hydration.
 *
 * Language: the Preset/Preview-mode/Reset/Lock sections below stay plain English,
 * like the rest of this repository's code and README — a developer tool a shopper
 * never sees, deliberately not wired into the 36 next-intl catalogs (rule 32a). The
 * Default-for-visitors and Composition sections are the one deliberate exception:
 * their vocabulary is a site setting whose wording matters to the operator, so this
 * package's own instructions route it through `useTranslations("Composition")` with
 * every new key recorded in `.ai/strings/P-panel.json` for the Locale stage — a
 * missing key renders its own path until then, which is expected at this stage.
 */

/** "default" is the SSR alias of the medusa preset; on screen it is that preset's row. */
function activePreset(value: string | undefined): string {
  return !value || value === "default" ? "medusa" : value
}

/** Presets in the order the reader sees them: alphabetical by label, never by id. */
const PRESETS = [...THEME_IDS].sort((a, b) =>
  (THEME_LABELS[a] ?? a).localeCompare(THEME_LABELS[b] ?? b)
)

// ── composition (site-wide default mode + the five block versions) ──────────────
//
// Contract: panel-composition-mockup.md §C1-§C7. This section owns a SEPARATE piece
// of state from the preset/preview-mode section above: it reads and writes
// `store.metadata.storefrontSettings` through the devtools proxy, not `localStorage`.

/** The stand's own built-in composition, used as the starting draft whenever nothing
 * has been saved yet or the backend cannot be reached — the same source
 * `getStorefrontSettings()`'s own unreachable fallback reads (storefront-settings.ts). */
const UNKNOWN_PROFILE_FALLBACK: StorefrontSettingsInput = {
  defaultMode: "light",
  header: "h1",
  hero: "none",
  tiles: "off",
  listing: "none",
  footer: "f1",
}

function isKnownProfileId(id: string): id is ProfileId {
  return Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, id)
}

function profileFallbackDraft(): StorefrontSettingsInput {
  return isKnownProfileId(profile.id) ? PROFILE_DEFAULTS[profile.id] : UNKNOWN_PROFILE_FALLBACK
}

function sameInput(a: StorefrontSettingsInput, b: StorefrontSettingsInput): boolean {
  return (
    a.defaultMode === b.defaultMode &&
    a.header === b.header &&
    a.hero === b.hero &&
    a.tiles === b.tiles &&
    a.listing === b.listing &&
    a.footer === b.footer
  )
}

type GetResponse = {
  settings: StorefrontSettings | null
  secretConfigured: boolean
  loadError?: boolean
}

type PutResponse =
  | { ok: true; settings: StorefrontSettings }
  | { ok: false; error: "invalid"; kind: "invalid_field"; errors: FieldError[] }
  | { ok: false; error: "invalid"; kind: "forbidden_combination"; rule: ForbiddenRule }
  | { ok: false; error: "backend_rejected"; status: number; message: string }
  | { ok: false; error: "backend_unreachable" }

function stripUpdatedAt(settings: StorefrontSettings): StorefrontSettingsInput {
  const { updatedAt: _updatedAt, ...input } = settings
  return input
}

export function Popover({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const t = useTranslations("Composition")
  const [theme, setTheme] = useState(() => activePreset(readCurrent()["data-theme"]))
  const [mode, setMode] = useState(() => readCurrent()["data-mode"] ?? "light")

  // ── composition state — loaded from the backend, edited locally, saved on demand ──
  const [draft, setDraft] = useState<StorefrontSettingsInput>(profileFallbackDraft)
  const [baseline, setBaseline] = useState<StorefrontSettingsInput>(profileFallbackDraft)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [secretConfigured, setSecretConfigured] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // False until the mount-time GET has answered (either way). Until then the save bar
  // shows a disabled Save button, not the "secret not configured" paragraph: measured
  // 2026-09-10, a click that landed before the answer hit that paragraph and was lost.
  const [loaded, setLoaded] = useState(false)
  const [openRow, setOpenRow] = useState<RowField | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  // True once the operator has picked anything. The settings fetch below resolves after
  // mount and must not wipe picks made while it was in flight: measured 2026-09-10 on
  // long-morning under load, a save carried only the last three picks because the GET
  // answered between the third and the fourth click and reset the draft to the server doc.
  const touchedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/devtools/settings", { cache: "no-store" })
        if (!res.ok) throw new Error(`GET /api/devtools/settings -> ${res.status}`)
        const body = (await res.json()) as GetResponse
        if (cancelled) return
        setSecretConfigured(body.secretConfigured)
        setLoadError(Boolean(body.loadError))
        if (body.settings) {
          const input = stripUpdatedAt(body.settings)
          setBaseline(input)
          if (!touchedRef.current) setDraft(input)
          setSavedAt(body.settings.updatedAt)
        }
        // settings === null (nothing saved yet, or unreachable): keep the profile
        // fallback both states already initialized to — D1 §C1's "Absent" row.
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = !sameInput(draft, baseline)

  const isOptionForbidden = (field: keyof StorefrontSettingsInput, value: string) =>
    isForbidden({ ...draft, [field]: value } as StorefrontSettingsInput)

  const pickTheme = (id: string) => {
    if (applyAxis("data-theme", id)) setTheme(id)
  }

  const pickMode = (next: string) => {
    if (applyAxis("data-mode", next)) setMode(next)
  }

  const pickDefaultMode = (next: Mode) => {
    if (isOptionForbidden("defaultMode", next)) return
    touchedRef.current = true
    setDraft((prev) => ({ ...prev, defaultMode: next }))
    if (saveState !== "pending") setSaveState("idle")
  }

  const pickComposition = (field: RowField, value: string) => {
    touchedRef.current = true
    setDraft((prev) => ({ ...prev, [field]: value }))
    if (saveState !== "pending") setSaveState("idle")
  }

  const toggleRow = (field: RowField) => {
    setOpenRow((current) => (current === field ? null : field))
  }

  const save = async () => {
    setSaveState("pending")
    setSaveError(null)
    try {
      const res = await fetch("/api/devtools/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      })
      if (res.status === 501) {
        setSecretConfigured(false)
        setSaveState("failed")
        setSaveError(t("ui.secretNotConfigured"))
        return
      }
      const body = (await res.json()) as PutResponse
      if (body.ok) {
        setBaseline(stripUpdatedAt(body.settings))
        setSavedAt(body.settings.updatedAt)
        setSecretConfigured(true)
        setLoadError(false)
        setSaveState("saved")
        window.setTimeout(() => {
          setSaveState((current) => (current === "saved" ? "idle" : current))
        }, 2000)
        return
      }
      setSaveState("failed")
      if (body.error === "invalid" && body.kind === "forbidden_combination") {
        setSaveError(body.rule.reason)
      } else if (body.error === "invalid") {
        setSaveError(t("ui.invalidBody"))
      } else if (body.error === "backend_rejected") {
        setSaveError(body.message || t("ui.backendRejected"))
      } else {
        setSaveError(t("ui.backendUnreachable"))
      }
      // dirty state and every row's attempted value are untouched — nothing is lost
      // (mockup acceptance criterion 8).
    } catch {
      setSaveState("failed")
      setSaveError(t("ui.backendUnreachable"))
    }
  }

  const reset = () => {
    resetAxes()
    const now = readCurrent()
    setTheme(activePreset(now["data-theme"]))
    setMode(now["data-mode"] ?? "light")
    // Composition edits are NOT discarded here — "Reset to default" stays scoped to
    // Preset + Preview mode, per the mockup's own open-fork resolution (a).
  }

  const lock = async () => {
    try {
      await fetch("/api/devtools/unlock", { method: "DELETE" })
    } catch {
      // the cookie outlives a failed request; the refresh below then changes nothing
    }
    onClose()
    router.refresh()
  }

  return (
    <div
      className="updev-popover"
      data-testid="devtools-popover"
      role="dialog"
      aria-label="Storefront devtools"
    >
      <div className="updev-head">
        <span className="updev-eyebrow">Storefront devtools</span>
        <button type="button" className="updev-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      <div className="updev-section">
        <span className="updev-label">Preset</span>
        <ul className="updev-list">
          {PRESETS.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="updev-row"
                data-testid={`devtools-preset-${id}`}
                aria-pressed={theme === id}
                onClick={() => pickTheme(id)}
              >
                <span
                  className="updev-swatch"
                  // the preset's own page and ink colours, straight out of themes.css;
                  // the Medusa bridge is switched off inside the swatch so it paints
                  // nothing but itself
                  data-theme={id}
                  data-mode={mode}
                  data-theme-bridge="off"
                  aria-hidden="true"
                />
                {THEME_LABELS[id] ?? id}
                {theme === id ? <CheckIcon /> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="updev-section">
        <span className="updev-label">{t("ui.previewLabel")}</span>
        <div className="updev-segment">
          {THEME_MODES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`devtools-mode-${id}`}
              aria-pressed={mode === id}
              onClick={() => pickMode(id)}
            >
              {id === "light" ? "Light" : "Dark"}
              {mode === id ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="updev-section">
        <span className="updev-label">{t("ui.defaultForVisitorsLabel")}</span>
        <div className="updev-segment">
          {(["light", "dark"] as const).map((id) => {
            const blocked = isOptionForbidden("defaultMode", id)
            return (
              <button
                key={id}
                type="button"
                data-testid={`devtools-default-mode-${id}`}
                aria-pressed={draft.defaultMode === id}
                aria-disabled={blocked ? true : undefined}
                disabled={Boolean(blocked)}
                onClick={() => pickDefaultMode(id)}
              >
                {id === "light" ? t("ui.modeLightButton") : t("ui.modeDarkButton")}
                {draft.defaultMode === id ? <CheckIcon /> : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="updev-section">
        <span className="updev-label">{t("ui.sectionLabel")}</span>
        <CompositionRows
          draft={draft}
          openRow={openRow}
          onToggleRow={toggleRow}
          onPick={pickComposition}
        />
      </div>

      <SaveBar
        draft={draft}
        dirty={dirty}
        savedAt={savedAt}
        secretConfigured={secretConfigured}
        loaded={loaded}
        loadError={loadError}
        saveState={saveState}
        errorMessage={saveState === "failed" ? saveError : null}
        onSave={save}
      />

      <div className="updev-hr" aria-hidden="true" />

      <p className="updev-source" data-testid="devtools-source">
        Rendered from <b>{THEME_TOKEN_COUNT}</b> tokens of preset{" "}
        {THEME_LABELS[theme] ?? theme}.
      </p>

      <div className="updev-actions">
        <button type="button" className="updev-ghost" data-testid="devtools-reset" onClick={reset}>
          Reset to default
        </button>
        <button type="button" className="updev-ghost" data-testid="devtools-lock" onClick={lock}>
          Lock
        </button>
      </div>
    </div>
  )
}
