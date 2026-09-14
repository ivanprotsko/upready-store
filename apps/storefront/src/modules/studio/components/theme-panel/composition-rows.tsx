"use client"

import { useTranslations } from "next-intl"

import {
  FOOTER_KEYS,
  FOOTER_LABELS,
  HEADER_KEYS,
  HEADER_LABELS,
  HERO_KEYS,
  HERO_LABELS,
  LISTING_KEYS,
  LISTING_LABELS,
  TILES_KEYS,
  TILES_LABELS,
  isAdvisory,
  isForbidden,
  type FooterKey,
  type HeaderKey,
  type HeroKey,
  type ListingKey,
  type StorefrontSettingsInput,
  type TilesKey,
} from "@lib/theme/composition"

import { BanIcon, CheckIcon, ChevronIcon } from "./icons"

/**
 * The five composition rows (Header/Hero/Category tiles/Listing/Footer). Contract:
 * `artifacts/docs/2026-09-09-panel-composition-mockup.md` §T1-§T4, §T7.
 *
 * One row open at a time (matches T1/T2: the other four stay collapsed at their
 * current value while one is expanded). Every option in an open row is checked live
 * against `isForbidden()` with every OTHER field held at its current (possibly still
 * unsaved) value — §C7's first of three enforcement points — so a forbidden pair is
 * unreachable from either side (mockup acceptance criterion 7): opening Header greys
 * the option that conflicts with the current Hero, and opening Footer greys the
 * option that conflicts with the current "Default for visitors", independently.
 *
 * The one-line "why" under an option (T2's "Burger left, wordmark centre,
 * utilities…") is `block-port-map.md`'s own "Markup shows" column, condensed to one
 * sentence per value and carried as a next-intl key here (never hardcoded, per this
 * package's own string rule) — a disabled option shows the FORBIDDEN rule's own
 * `reason` instead (already plain English in `composition.ts`, shared with the proxy
 * and the backend, so it is not re-translated here).
 */

export type RowField = "header" | "hero" | "tiles" | "listing" | "footer"

type RowDef<K extends string> = {
  field: RowField
  rowLabelKey: string
  slug: string
  keys: readonly K[]
  labels: Record<K, string>
  why: Partial<Record<K, string>>
}

/**
 * Condensed from `artifacts/docs/2026-09-09-block-port-map.md` §3/§4/§6/§7 ("Markup
 * shows" column), one sentence per value. Registered as next-intl keys in
 * `.ai/strings/P-panel.json` for the Locale stage; not filled into `messages/*.json`
 * in this stage (renders its key path in dev, per this package's own instructions).
 */
const HEADER_WHY: Partial<Record<HeaderKey, string>> = {
  h1: "Composition.headerWhy.h1",
  h2: "Composition.headerWhy.h2",
  h3: "Composition.headerWhy.h3",
  h4: "Composition.headerWhy.h4",
  h5: "Composition.headerWhy.h5",
  h6: "Composition.headerWhy.h6",
}
const HERO_WHY: Partial<Record<HeroKey, string>> = {
  none: "Composition.heroWhy.none",
  g: "Composition.heroWhy.g",
  h: "Composition.heroWhy.h",
  j: "Composition.heroWhy.j",
  k: "Composition.heroWhy.k",
  l: "Composition.heroWhy.l",
  m: "Composition.heroWhy.m",
  ga: "Composition.heroWhy.ga",
  gb: "Composition.heroWhy.gb",
}
const LISTING_WHY: Partial<Record<ListingKey, string>> = {
  none: "Composition.listingWhy.none",
  p1: "Composition.listingWhy.p1",
  p2: "Composition.listingWhy.p2",
  p3: "Composition.listingWhy.p3",
  p4: "Composition.listingWhy.p4",
  p5: "Composition.listingWhy.p5",
}
const FOOTER_WHY: Partial<Record<FooterKey, string>> = {
  none: "Composition.footerWhy.none",
  f1: "Composition.footerWhy.f1",
  f2: "Composition.footerWhy.f2",
  f3: "Composition.footerWhy.f3",
  f4: "Composition.footerWhy.f4",
  f5: "Composition.footerWhy.f5",
  f6: "Composition.footerWhy.f6",
}
// Tiles is a plain on/off switch — no "Markup shows" prose exists for either value
// (block-port-map.md §5), so this row shows no why line, only the advisory note.
const TILES_WHY: Partial<Record<TilesKey, string>> = {}

const ROWS: readonly RowDef<string>[] = [
  {
    field: "header",
    rowLabelKey: "ui.rowHeader",
    slug: "header",
    keys: HEADER_KEYS,
    labels: HEADER_LABELS,
    why: HEADER_WHY,
  },
  {
    field: "hero",
    rowLabelKey: "ui.rowHero",
    slug: "hero",
    keys: HERO_KEYS,
    labels: HERO_LABELS,
    why: HERO_WHY,
  },
  {
    field: "tiles",
    rowLabelKey: "ui.rowTiles",
    slug: "tiles",
    keys: TILES_KEYS,
    labels: TILES_LABELS,
    why: TILES_WHY,
  },
  {
    field: "listing",
    rowLabelKey: "ui.rowListing",
    slug: "listing",
    keys: LISTING_KEYS,
    labels: LISTING_LABELS,
    why: LISTING_WHY,
  },
  {
    field: "footer",
    rowLabelKey: "ui.rowFooter",
    slug: "footer",
    keys: FOOTER_KEYS,
    labels: FOOTER_LABELS,
    why: FOOTER_WHY,
  },
]

export function CompositionRows({
  draft,
  openRow,
  onToggleRow,
  onPick,
}: {
  draft: StorefrontSettingsInput
  openRow: RowField | null
  onToggleRow: (field: RowField) => void
  onPick: (field: RowField, value: string) => void
}) {
  const t = useTranslations("Composition")
  // HEADER_LABELS/HERO_WHY/etc (composition.ts) store FULL "Namespace.key" strings,
  // not keys relative to this component's own "Composition" namespace binding — the
  // same convention `side-menu/index.tsx` uses for a dynamically-picked key. Calling
  // the namespaced `t` on one of those would look up "Composition.Composition.…" and
  // never resolve, so every full-key lookup below goes through this unprefixed one.
  const tFull = useTranslations()

  return (
    <div className="upstudio-comp-rows" role="group" aria-label={t("ui.sectionLabel")}>
      {ROWS.map((row) => {
        const isOpen = openRow === row.field
        const currentKey = draft[row.field]
        const currentLabelKey = row.labels[currentKey] ?? currentKey
        // The one advisory rule (hero ga/gb x tiles on) is shown on the TILES row —
        // the "against" side of the pair — matching T4's own frame.
        const advisory = row.field === "tiles" ? isAdvisory(draft) : null

        return (
          <div key={row.field} className="upstudio-comp-row">
            <button
              type="button"
              className="upstudio-comp-row-head"
              data-testid={`studio-slot-${row.slug}`}
              aria-expanded={isOpen}
              onClick={() => onToggleRow(row.field)}
            >
              <span className="upstudio-comp-row-label">{t(row.rowLabelKey)}</span>
              {!isOpen ? (
                <span className="upstudio-comp-row-value">{tFull(currentLabelKey)}</span>
              ) : null}
              <ChevronIcon direction={isOpen ? "up" : "down"} />
            </button>

            {isOpen && advisory ? (
              <p className="upstudio-comp-advisory">
                <span className="upstudio-comp-advisory-mark" aria-hidden="true">
                  ⓘ
                </span>
                {advisory.reason}
              </p>
            ) : null}

            {isOpen ? (
              <div className="upstudio-comp-options" role="radiogroup" aria-label={t(row.rowLabelKey)}>
                {row.keys.map((key) => {
                  const active = key === currentKey
                  const hypothetical = { ...draft, [row.field]: key } as StorefrontSettingsInput
                  const blocking = isForbidden(hypothetical)
                  const whyKey = row.why[key]

                  return (
                    <button
                      type="button"
                      key={key}
                      role="radio"
                      aria-checked={active}
                      aria-disabled={blocking ? true : undefined}
                      disabled={Boolean(blocking)}
                      className="upstudio-comp-option"
                      data-testid={`studio-slot-${row.slug}-option-${key}`}
                      onClick={() => {
                        if (blocking) return
                        onPick(row.field, key)
                      }}
                    >
                      <span className="upstudio-comp-option-head">
                        {blocking ? (
                          <BanIcon />
                        ) : (
                          <span className="upstudio-radio" data-checked={active} aria-hidden="true" />
                        )}
                        <span className="upstudio-comp-option-label">{tFull(row.labels[key] ?? key)}</span>
                        {active && !blocking ? <CheckIcon /> : null}
                      </span>
                      {blocking ? (
                        <span className="upstudio-comp-option-why upstudio-comp-option-blocked">
                          {blocking.reason}
                        </span>
                      ) : whyKey ? (
                        <span className="upstudio-comp-option-why">{tFull(whyKey)}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
