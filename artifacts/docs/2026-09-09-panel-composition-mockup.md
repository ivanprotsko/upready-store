# Extended settings panel (composition + site-wide default) — ASCII mock-up

Design stage for `t-2026-09-09-02` point 1 (rule 27d), written before any code exists. Canon:
`~/upready/packages/geist-kit/AGENTS.md` (sentence case, weight ≤ 600, one accent, Geist Mono +
`tabular-nums`, hairline borders, status = 8px dot + text). Baseline this extends:
`artifacts/docs/2026-09-08-theme-panel-mockup.md` (S0–S11, mechanics unchanged: hold-to-unlock,
password, cookie, `<dialog>`, Preset section — not redrawn here). Vocabulary/validity:
`artifacts/docs/2026-09-09-composition-contract.json`. Component-porting plan for the 5 slots
themselves (out of scope here): `artifacts/docs/2026-09-09-block-port-map.md`. Persistence
architecture these contracts implement: `artifacts/docs/2026-09-09-settings-persistence-deploy-map.md`.

**Scope boundary.** This document specs the panel UI, the settings document, the routes, and SSR mode
resolution — not the header/hero/tiles/listing/footer *rendering* components (`block-port-map.md`'s job).

## Facts this mock-up is drawn on (measured 2026-09-09)

| Fact | Value | Source |
|---|---|---|
| Existing panel sections | 2 (Preset, Mode) | `theme-panel/popover.tsx:88-134` |
| Existing axes, both `localStorage`-only | `data-theme`, `data-mode` | `lib/theme/attributes.ts:27-42` |
| Existing mode testids (unchanged by this doc) | `devtools-mode-light/-dark` | `popover.tsx:125` |
| Composition vocabulary | 6 fields, 5 slots + `defaultMode` | `composition-contract.json:9-76` |
| Forbidden / advisory combinations | 2 / 1 | `composition-contract.json:91-109` |
| Site-wide vs. home-only slots | header, footer site-wide; hero, tiles, listing home-only | `(main)/layout.tsx:26,29` render Nav/Footer per route-group; `(main)/page.tsx` renders the rest |
| No visitor-facing mode toggle exists today | confirmed | `grep -rn "sun\|moon\|ThemeToggle" src/modules/layout src/modules/common` → no hit |
| Shared-secret precedent | `REVALIDATE_SECRET` | `storefront/.env.template:27`, `backend/.env.template:30-31` |
| Devtools 404-when-off gate, reused as-is | n/a | `api/devtools/unlock/route.ts:21-26`, `lib/devtools/session.ts:36-41` |
| `store.metadata` JSON bag; shared cache-tag precedent | n/a | `settings-persistence-deploy-map.md:112-113`; `app/llms.txt/route.ts:19` |
| Desktop Nav cluster / mobile bottom-nav slots | Search+RegionSelect+account+cart / 5, all occupied | `nav/index.tsx:43-64` / `bottom-nav/index.tsx:20-49` |

## Vocabulary the panel renders (ids never on screen, rule 27d criterion 1)

English labels translate the composer's Russian ones, matching Ivan's own example wording ("Centre
with a category strip", "Announcement", "Spec list", "Inverted giant wordmark") where he supplied it,
and `block-port-map.md`'s "Markup shows" column otherwise. Key → label, grouped by slot; the one-line
"why" under each option (from that same "Markup shows" column) is illustrated live in T2/T3 below and
not repeated per value here.

- **Header** — h1 As it is today · h2 Left, menu in a row · h3 Two tiers · h4 Accent ·
  h5 Slim + category strip · h6 Centre + category strip
- **Hero** — none None · g Showcase · h Shelf · j Three doors · k Announcement · l In motion ·
  m No hero, text only · ga Carousel with neighbours · gb Stripes
- **Category tiles** — on On · off Off
- **Listing** — none None · p1 Grid of 4 · p2 Dense 6 · p3 Spec list · p4 Wall · p5 Editorial
- **Footer** — none None · f1 Four columns · f2 One row · f3 Giant wordmark ·
  f4 Inverted, with newsletter · f5 Terms as tiles · f6 Inverted giant wordmark

## Contracts

### C1 · Settings document shape

`store.metadata.storefrontSettings` on the one `Store` row of each profile's own backend (five
independent stands per F1, one document per stand, no profile key needed inside it):

```json
{ "schema": "upready.storefront-settings/v1", "defaultMode": "dark",
  "header": "h6", "hero": "k", "tiles": "off", "listing": "p3", "footer": "f6",
  "updatedAt": "2026-09-09T20:41:00.000Z" }
```

Same enum vocabulary as `composition-contract.json` but a smaller, separate document: the contract JSON
carries labels/citations/validity for the design stage, this carries only the six operator-set values.
Absent (never saved) → read path (§C5) returns `null` → render side falls back to today's baseline
(H1, profile's existing hero, tiles-if-present, existing listing, F1) unchanged.

### C2 · Backend routes — `GET`/`PUT /store/storefront-settings`

New `apps/backend/src/api/store/storefront-settings/route.ts`, following the `GET → 200` scaffolds
already in the tree (`api/store/custom/route.ts`, `api/admin/custom/route.ts`) and the routing
convention in `apps/backend/src/api/README.md:78-100`.

```
GET → 200 { settings: StorefrontSettings | null } — behind Medusa's global publishable-key
      middleware on /store/* (existing, not new)
PUT headers: x-storefront-settings-secret: <SECRET> · body: all 6 fields, whole-document replace
     → 401 unauthorized · 400 invalid_field · 422 forbidden_combination (plain-language reason)
     → 200 { settings } — updateStores(id, { metadata: {...existing, storefrontSettings} }),
       updatedAt stamped server-side
```

`STOREFRONT_SETTINGS_SECRET` — new var, mirrors `REVALIDATE_SECRET` (`storefront/.env.template:27`,
`backend/.env.template:30-31`): added to both `.env.template` files, same value in both apps. No Admin
auth — the operator acts through the storefront's own hidden panel, not Medusa Admin.

### C3 · Storefront proxy — `/api/devtools/settings`

New `apps/storefront/src/app/api/devtools/settings/route.ts`. The panel never sees
`STOREFRONT_SETTINGS_SECRET`, exactly as `STOREFRONT_DEVTOOLS_PASSWORD` never reaches the browser
(`session.ts:1-20`). Gate: `isDevtoolsEnabled()` + `devtoolsCookieIsValid()` — either failing → `404`,
indistinguishable from an undeployed route (same pattern as `unlock/route.ts:21-26`). `middleware.ts`
excludes `/api` already, so no locale handling is needed here (`api/payment-return` precedent).

```
GET  gate fails → 404 · gate passes → backend GET, cache:"no-store" (never the tagged cache — the
     operator sees the live value, not a stale tab) → 200 { settings, secretConfigured: boolean }
     (checked HERE, storefront env, so the panel warns before a save, not after an unexplained 401)
     · backend unreachable → 200 { settings: null, secretConfigured, loadError: true }
PUT  gate fails → 404 · secret unset → { ok:false, error:"secret_not_configured" } · body invalid
     (defensive re-check, §C7 validators) → { ok:false, error:"invalid", … } · forwards to backend
     PUT with the secret header · network/backend error → { ok:false, error:"backend_unreachable" }
     · backend 200 → revalidateTag("storefront-settings") in THIS SAME handler (no round trip
     through /api/revalidate — write and revalidation share one process) → { ok:true, settings }
```

Every response here is HTTP `200` with an `ok`/`error` body — the panel always needs to read that body
to pick a failure frame, and the devtools cookie gate is what does the real access control, at `404`.

### C4 · TypeScript types

New `apps/storefront/src/lib/theme/composition.ts` (pure — no `"use client"`/`"use server"`, so both
the server loader and the client popover import it):

```ts
export type Mode = "light" | "dark"
export type HeaderKey = "h1"|"h2"|"h3"|"h4"|"h5"|"h6"
export type HeroKey = "none"|"g"|"h"|"j"|"k"|"l"|"m"|"ga"|"gb"
export type TilesKey = "on"|"off"
export type ListingKey = "none"|"p1"|"p2"|"p3"|"p4"|"p5"
export type FooterKey = "none"|"f1"|"f2"|"f3"|"f4"|"f5"|"f6"
export type StorefrontSettings = { defaultMode: Mode; header: HeaderKey; hero: HeroKey
  tiles: TilesKey; listing: ListingKey; footer: FooterKey; updatedAt: string }
export type ForbiddenRule = { field: keyof StorefrontSettings; value: string
  against: keyof StorefrontSettings; againstValue: string; reason: string }
export const FORBIDDEN: readonly ForbiddenRule[] = [
  { field: "header", value: "h4", against: "hero", againstValue: "k",
    reason: "Header Accent and hero Announcement both fill their bar with the accent, nothing between." },
  { field: "footer", value: "f6", against: "defaultMode", againstValue: "dark",
    reason: "Footer Inverted giant wordmark turns light on a dark page — reads as detached, not a foundation." },
]
export function isForbidden(next: StorefrontSettings): ForbiddenRule | null { /* … */ }
```

`FORBIDDEN` is hand-transcribed from `composition-contract.json:91-103`, not fetched at runtime — the
contract JSON is a design-time artifact under `artifacts/`, not a storefront build dependency.

### C5 · Read path — cache tag and revalidation

New `apps/storefront/src/lib/data/storefront-settings.ts`, `"use server"` (matches `AGENTS.md:156-158`
and `cart.ts:1`):

```ts
"use server"
export async function getStorefrontSettings(): Promise<StorefrontSettings | null> {
  const { settings } = await sdk.client.fetch<{ settings: StorefrontSettings | null }>(
    "/store/storefront-settings", { next: { tags: ["storefront-settings"] }, cache: "force-cache" })
  return settings
}
```

One shared tag, no per-visitor suffix. Every existing loader (`categories.ts:7,33`) calls
`getCacheOptions("categories")`, building `${tag}-${cacheId}` off `_medusa_cache_id` — deliberately
per-browser, since carts/listings differ by session. `storefrontSettings` is the opposite: one answer
for everyone, so it uses the bare string `"storefront-settings"`, matching `llms.txt/route.ts:19`. One
`revalidateTag("storefront-settings")` (fired inside §C3's PUT proxy, same request) invalidates it for
every visitor at once.

### C6 · SSR mode resolution and the flash-free guarantee

Resolution order, highest priority first:

```
1. visitor's own localStorage["upready-store.mode"]   set by EITHER the popover's "Preview in
                                                        this browser" segment OR the new
                                                        visitor-facing toggle (§S11-S13)
2. the saved site-wide defaultMode                     store.metadata.storefrontSettings.defaultMode
3. the profile's built-in default                      readProfileTheme() (profile.ts:40-62), unchanged
```

`RootLayout` (`app/layout.tsx:14-19`) additionally awaits `getStorefrontSettings()` and paints
`data-mode` from step 2 when a saved setting exists, else step 3 — exactly as it paints `data-theme`
today. The **pre-paint script is untouched**: generated from `AXES` (`pre-paint.ts:25-32`), it already
overwrites `data-mode` from `localStorage` before first paint when present and allow-listed (step 1). A
visitor who never touched the toggle sees SSR's step-2/3 value with no overwrite (nothing in storage
disagrees, no flash); one who did gets it overwritten before paint — the baseline doc's S9 guarantee,
now with a third fallback level instead of two.

### C7 · Validity filter — enforced three times

Two rules block a save (§C4 `FORBIDDEN`); one is advisory only (`composition-contract.json:104-109`,
hero ga/gb × tiles on). The SAME `isForbidden()` runs in three places so no path bypasses it: the
popover greys an option live (§T3–T4), the proxy re-checks the assembled document (§C3), the backend
re-checks it again before writing (§C2) — the one place that truly cannot be skipped.

### C8 · Panel data-testids

| Element | testid | Notes |
|---|---|---|
| Preview / Default-for-visitors segments | `devtools-mode-light/-dark` (unchanged) / `devtools-default-mode-light/-dark` (new) | Preview label changed only |
| Composition row / option | `devtools-slot-{header\|hero\|tiles\|listing\|footer}` / `-option-{key}` | e.g. `devtools-slot-header-option-h4` |
| Dirty indicator / source line | `devtools-composition-dirty` / `-source` | source distinct from theme `devtools-source` |
| Save button / error text | `devtools-composition-save` (`data-state=`) / `-error` | error present only when failed |
| Visitor toggle, desktop / mobile | `nav-mode-toggle` / `bottom-nav-mode-toggle` | §S11 / §S12 |

## Panel states

Baseline S0–S11 (hold-to-unlock, password, cookie, reload, lock, mobile shell, Preset) unchanged, not
redrawn. Section order: Preset / Preview in this browser (was "Mode", mechanism unchanged) / Default
for visitors (new) / Composition (new) / source line (new) / Save (new) / theme source line / Reset+Lock.

### T1 · Popover open, loaded, nothing changed — the full new body

288px wide still, now with `max-height: calc(100vh - 120px); overflow-y: auto` on `.updev-popover`
(four sections plus five rows no longer fit a fixed height).

```
   ┌────────────────────────────────────────────────┐
   │ STOREFRONT DEVTOOLS                       ✕    │
   ├────────────────────────────────────────────────┤
   │ Preset …7 rows, unchanged (baseline S5)…       │
   │ Preview in this browser  [ Light ✓ | Dark ]     │  ← was "Mode"
   │ Default for visitors     [ Light | Dark ✓ ]     │  ← NEW, persisted
   │ Composition                                    │  ← NEW
   │  Header      Centre + category strip        ▾  │
   │  Hero        Announcement                   ▾  │
   │  Category tiles                       Off   ▾  │
   │  Listing     Spec list                       ▾  │
   │  Footer      Inverted giant wordmark         ▾  │
   │ Visitors see Centre with a category strip ·    │  ← NEW source line
   │ Announcement · Spec list · Inverted giant       │
   │ wordmark, dark by default. Saved today 20:41.  │
   │       ┌────────────────────────────────────┐   │
   │       │      Save for all visitors         │   │  ← disabled, nothing dirty
   │       └────────────────────────────────────┘   │
   ├────────────────────────────────────────────────┤
   │ Rendered from 31 tokens of preset Kerbstone.   │  ← unchanged theme source line
   │  Reset to default            Lock              │
   └────────────────────────────────────────────────┘
   mount: GET /api/devtools/settings → 200
   { settings: {defaultMode:"dark",header:"h6",hero:"k",tiles:"off",listing:"p3",
     footer:"f6",updatedAt:"2026-09-09T20:41:00Z"}, secretConfigured: true }
```

Each row closed shows one line (`Header      Centre + category strip        ▾`); the "why" text only
appears once that row's own select is open, so five closed rows never triple the section's height.

### T2 · Row open — Header, one option greyed by the CURRENT hero

Opens in place (not a popover-on-a-popover); the other four rows stay collapsed at their current value.

```
   │ Header                                     ▴  │
   │  ○ As it is today                              │
   │    Burger left, wordmark centre, utilities…    │
   │  ○ Left, menu in a row                         │
   │  ○ Two tiers                                   │
   │  ⊘ Accent                                       │  ← greyed, --faint, no hover
   │    Not with hero Announcement — two accent      │
   │    planes touch with nothing between them.      │
   │  ○ Slim + category strip                        │
   │  ● Centre + category strip                 ✓   │  ← active, --secondary bg
```

`isForbidden()` runs against the composition AS IT WOULD BE with this option picked, holding every
other (possibly still-unsaved) field at its current value — greying updates live as other rows change.

### T3 · Row open — Footer, greyed by the CURRENT "Default for visitors"

```
   │ Footer                                     ▴  │
   │  ○ None · Four columns · One row · Giant …     │
   │  ○ Inverted, with newsletter · Terms as tiles   │
   │  ⊘ Inverted giant wordmark                       │  ← greyed
   │    Not with dark as the default for visitors —  │
   │    the inversion turns light on a dark page.    │
```

The same rule reads either direction: if Footer is ALREADY F6 and the visitor instead flips "Default
for visitors" to Dark, the grey appears on the Dark button of that segment instead — whichever side is
edited second shows the grey, never both at once (a conflict must stay resolvable from either side).

### T4 · Advisory (never blocks) and the dirty/save cycle

```
   │ Category tiles          ▴   ⓘ Hero Carousel with neighbours already routes into
   │  ○ On   ● Off ✓              categories; Tiles On here would repeat that on the
   │                                same screen.                    (shown only while
                                                                      hero∈{ga,gb} ∧ tiles=on)

   ● Unsaved changes                          data-testid="devtools-composition-dirty"

   idle (dirty)     [ Save for all visitors ]              data-state="idle"
   pending (click)  [ ○ Saving… ]  disabled                data-state="pending"
                    PUT /api/devtools/settings { all 6 fields }
   saved (~2s)      [ ✓ Saved ]  → reverts to idle,        data-state="saved"
                    disabled; dirty indicator gone, source line updates (T5)
   failed           [ Save for all visitors ]  re-enabled  data-state="failed"
                    ● <reason, see T6>          data-testid="devtools-composition-error"
```

### T5 · Source line, before/after; tiles omitted from the sentence when Off

```
BEFORE  Visitors see Centre with a category strip · Announcement · Spec list ·
        Inverted giant wordmark, dark by default. Saved today 20:41.
AFTER   (footer → Giant wordmark) …Spec list · Giant wordmark, dark by default. Saved today 20:44.
tiles On (e.g. h2 + tiles on + p2): …Left, menu in a row · Category tiles · Dense 6, light … Saved …
```

### T6 · Failures — secret not configured, backend unreachable

Secret-unset is detected proactively from `secretConfigured` at mount (shows the moment the popover
opens, no save attempt needed); backend-unreachable only appears after a save is attempted, so it
implies the secret check already passed.

```
secret not configured (replaces the Save button entirely, --faint, no dot — the same "off" framing
already used for STOREFRONT_DEVTOOLS_PASSWORD unset):
⊘ Saving is off on this stand: an operator has not set STOREFRONT_SETTINGS_SECRET yet.

backend unreachable (Save clicked, secret WAS configured):
[ Save for all visitors ]   ● Could not reach the backend. Try again.
PUT → 200 { ok:false, error:"backend_unreachable" } — store.metadata UNCHANGED, the popover's five
rows keep showing the attempted values, still dirty — nothing is lost
```

### T7 · Mobile, 390px — composition section

Row-open state becomes a full-width sheet (not an inline expansion), so a "why" line never truncates.

```
┌──────────────────────────┐
│ STOREFRONT DEVTOOLS    ✕ │
│ …Preset, Preview, Default │
│  for visitors…            │
│ Composition                │
│  Header    Centre… ▾      │
│  Hero      Announ… ▾      │
│  Tiles     Off     ▾      │
│  Listing   Spec l… ▾      │
│  Footer    Invert… ▾      │
│ Visitors see Centre with   │
│ a category strip · …giant  │
│ wordmark, dark by default. │
│ Saved …                    │
│ [ Save for all visitors ]  │
└──────────────────────────┘
```

## Visitor-facing mode toggle

Ivan's phrase "the DEFAULT … shown to visitors who have not switched it themselves" implies a visitor
CAN switch — nothing does that today (Facts table). It writes the SAME `data-mode` axis the devtools
"Preview in this browser" segment already writes (`applyMode()`, `apply.ts:28`) — one mechanism, two
entry points. It never touches the saved `defaultMode` — a click is always step 1 of §C6's order,
per-browser like every other `localStorage` axis.

### S11 · Desktop (Nav utility cluster) and S12 · mobile (bottom-nav, 6th slot)

Desktop: first in the cluster, before `Search`, inside `nav/index.tsx:43-45`'s
`<div className="ms-auto flex … justify-end gap-x-4 …">`. Mobile: `bottom-nav/index.tsx:20-49` has 5
equal `flex-1` slots and no free one, so the toggle is appended LAST, existing five keep their position.

```
│ ☰   search   K E R B S T O N E              ☀  ⚲  us ▾   ♡   ⛒ 0       │  ← nav-mode-toggle, 16px
│  ▤    ⚲    ◉    ☺   ☀  ⛒ │  ← bottom-nav, 6 slots now, [&_svg]:size-5 unchanged, 390/6≈65px each
```

☀ shown in dark mode (click → light), ☾ shown in light mode (click → dark) — both placements.

### S13 · Click behaviour

```
before: <html data-mode="dark">  ☀ shown         after: <html data-mode="light">  ☾ shown
localStorage["upready-store.mode"] = "light"   ← same key the devtools Preview segment writes
store.metadata…defaultMode                     ← UNCHANGED, still dark
an open devtools popover in this browser reflects the new mode live (same axis)
```

## Canon compliance, additions only (baseline table still holds)

| Canon rule | How the extension keeps it |
|---|---|
| sentence case | "Save for all visitors", "Unsaved changes" — no title case, no raw key on screen. |
| weight ≤ 600 | Save button 500 (polarity flip), row labels 400 — nothing heavier added. |
| one accent | `--faint` for disabled/greyed, `--red` only for the failed-save dot. |
| mono + tabular-nums | Timestamps in the source line, same treatment as the existing "31" token count. |
| hairline borders | Row dividers, mobile sheet border — 1px `--border`, no new weight. |
| status = 8px dot + text | Dirty indicator, save-failed line — same `.dot` pattern as baseline S3. |
| monochrome icons | ☀/☾: stroke 1.5, `currentColor`, 16px — matches the existing `SlidersIcon`. |

## Acceptance

1. **No identifier reaches the screen.** Rows show labels, never keys; greyed reasons name the conflict by label (T2, T3).
2. **No truncation at 390px.** T7 draws the mobile sheet full-width so a "why" line wraps, not clips.
3. **No list longer than one screen without a filter.** Rows collapsed by default (T1); only the opened row's options show at once (T2, T3).
4. **Status is a dot plus a sentence.** Dirty indicator and save failure (T4, T6) follow this; a greyed-option reason has no dot — it explains, it does not report a state.
5. **Three hierarchy levels are visually distinct.** Section label (12px `--faint`) / row (14px) / the row's own why-or-greyed line (12px, indented, `--faint`) — T1–T3.
6. **Every frame is drawn, not described.** T1–T7 and S11–S13 are ASCII frames; nothing is asserted only in prose.
7. **A forbidden combination is unreachable from either side of it.** T2 greys header when hero conflicts; T3 greys footer when mode conflicts — check by opening each row from a composition that trips one rule and confirming the OTHER row shows the grey.
8. **A failed save loses no edit.** T6: `store.metadata` stays unchanged and the popover's dirty state survives `backend_unreachable` — check by stopping the backend, saving, and confirming the five rows still show the attempted values, not a reset.

## Open forks

| Question | Options | Recommendation |
|---|---|---|
| Generate the "why" strings from `composition-contract.json` at build time, or hand-author them as this doc proposes | (a) small generated file, like `presets.generated.ts` from `themes.css`; (b) hand-authored, matching this doc's table | (b) for now — 30 fixed values across 5 slots; worth a generator only once a second consumer needs the same English strings |
| Should `Reset to default` also discard an unsaved composition edit | (a) stays scoped to Preset + Preview only, as assumed throughout; (b) extend to composition too | (a) — the label says "to default" (the theme fallback); discarding unsaved edits is a different action deserving its own control if ever asked for |
| Mode-toggle icon: shows the mode you'd switch TO, or the current mode | (a) switch-to (☀ visible in dark mode), as drawn in S11–S13; (b) current-mode readout | (a) — matches macOS/GitHub convention; a current-mode readout would need the 8px-dot-plus-text pattern instead, heavier than this control needs |
| One `STOREFRONT_SETTINGS_SECRET` shared across all five stands, or distinct per stand | not checked here — `settings-persistence-deploy-map.md` did not confirm whether the five worktrees currently share one `REVALIDATE_SECRET` value | Mirror whatever `REVALIDATE_SECRET`'s existing pattern turns out to be; §C2/§C3 work identically either way |
