"use client"

import { useTranslations } from "next-intl"

import {
  FOOTER_LABELS,
  HEADER_LABELS,
  HERO_LABELS,
  LISTING_LABELS,
  type StorefrontSettingsInput,
} from "@lib/theme/composition"

import { BanIcon, CheckIcon } from "./icons"

/**
 * The source line (T5), dirty indicator and Save button (T4/T6). Contract:
 * `artifacts/docs/2026-09-09-panel-composition-mockup.md`.
 *
 * Owns none of the draft state — `popover.tsx` holds it and passes the finished
 * sentence's ingredients down, the same split `composition-rows.tsx` uses.
 */

export type SaveState = "idle" | "pending" | "saved" | "failed"

function formatSavedAt(iso: string, todayWord: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const hhmm = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  if (sameDay) return `${todayWord} ${hhmm}`
  const day = date.toLocaleDateString("en-GB", { month: "short", day: "numeric" })
  return `${day}, ${hhmm}`
}

/** Sentence parts in composePage's own order (header/hero/tiles/listing/footer). Tiles
 * contributes its row label only when on, everything named "none" is dropped — T5. */
function sourceParts(
  draft: StorefrontSettingsInput,
  t: (key: string) => string,
  tilesRowLabel: string
): string[] {
  const parts: string[] = [t(HEADER_LABELS[draft.header])]
  if (draft.hero !== "none") parts.push(t(HERO_LABELS[draft.hero]))
  if (draft.tiles === "on") parts.push(tilesRowLabel)
  if (draft.listing !== "none") parts.push(t(LISTING_LABELS[draft.listing]))
  if (draft.footer !== "none") parts.push(t(FOOTER_LABELS[draft.footer]))
  return parts
}

export function SaveBar({
  draft,
  dirty,
  savedAt,
  secretConfigured,
  loaded,
  loadError,
  saveState,
  errorMessage,
  onSave,
}: {
  draft: StorefrontSettingsInput
  dirty: boolean
  /** `updatedAt` of the last-saved document, or null when nothing has been saved yet. */
  savedAt: string | null
  secretConfigured: boolean
  /** The mount-time GET has answered; before that the Save button renders disabled. */
  loaded: boolean
  /** GET could not reach the backend at mount — the panel is showing a fallback. */
  loadError: boolean
  saveState: SaveState
  errorMessage: string | null
  onSave: () => void
}) {
  const t = useTranslations("Composition")
  // HEADER_LABELS/HERO_LABELS/etc store FULL "Namespace.key" strings — see the same
  // note in composition-rows.tsx. sourceParts() looks them up, so it needs the
  // unprefixed translator, not this component's own "Composition"-namespaced one.
  const tFull = useTranslations()

  const tilesRowLabel = t("ui.rowTiles")
  const parts = sourceParts(draft, tFull, tilesRowLabel)
  const modeWord = t(draft.defaultMode === "dark" ? "ui.modeDarkWord" : "ui.modeLightWord")
  const savedAtText = savedAt ? formatSavedAt(savedAt, t("ui.today")) : null

  const sentence = t("ui.sourceLine", { parts: parts.join(" · "), mode: modeWord })

  return (
    <div className="updev-comp-savebar">
      {dirty ? (
        <p className="updev-comp-dirty" data-testid="devtools-composition-dirty">
          <span className="updev-dot updev-dot-muted" aria-hidden="true" />
          {t("ui.dirty")}
        </p>
      ) : null}

      <p className="updev-source" data-testid="devtools-composition-source">
        {sentence} {savedAtText ? t("ui.savedAt", { time: savedAtText }) : t("ui.notSavedYet")}
      </p>

      {loadError ? (
        <p className="updev-comp-note">
          <span className="updev-dot updev-dot-muted" aria-hidden="true" />
          {t("ui.loadError")}
        </p>
      ) : null}

      {!loaded ? (
        <button
          type="button"
          className="updev-primary updev-comp-save"
          data-testid="devtools-composition-save"
          data-state="loading"
          disabled
        >
          {t("ui.saveIdle")}
        </button>
      ) : !secretConfigured ? (
        <p className="updev-comp-off" data-testid="devtools-composition-save" data-state="off">
          <BanIcon />
          {t("ui.secretNotConfigured")}
        </p>
      ) : (
        <>
          <button
            type="button"
            className="updev-primary updev-comp-save"
            data-testid="devtools-composition-save"
            data-state={saveState}
            disabled={saveState === "pending" || saveState === "saved" || !dirty}
            onClick={onSave}
          >
            {saveState === "pending"
              ? t("ui.savePending")
              : saveState === "saved"
                ? (
                    <>
                      <CheckIcon /> {t("ui.saveSaved")}
                    </>
                  )
                : t("ui.saveIdle")}
          </button>
          {saveState === "failed" && errorMessage ? (
            <p className="updev-error" data-testid="devtools-composition-error">
              <span className="updev-dot" aria-hidden="true" />
              {errorMessage}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
