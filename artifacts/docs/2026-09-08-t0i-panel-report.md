# T0i — hidden settings panel: what was built and what was measured

Task `t-ds-0b-theme-presets-panel`, branch `dev`, commit `f53b910`. Brief:
`docs/prompts/initial-prompt-2026-09-06-orchestrator-theme-presets-panel.md` §T0i.
Design stage first: `artifacts/docs/2026-09-08-theme-panel-mockup.md` (12 states, canon
`~/upready/packages/geist-kit/AGENTS.md`).

Every number below was produced by the command printed next to it, on the live stand
`http://localhost:8000` (backend `:9022`, profile sneakers / Kerbstone). Nothing here is
an estimate.

## Files

| File | What it is |
|---|---|
| `apps/storefront/src/lib/devtools/session.ts` | server-only: password read, constant-time compare, HMAC cookie issue/verify |
| `apps/storefront/src/app/api/devtools/unlock/route.ts` | POST unlock / DELETE lock; 404 when the variable is empty |
| `apps/storefront/src/modules/devtools/components/brand-unlock/index.tsx` | 2 s hold on the brand → native `<dialog>` password prompt (mounted only after the hold fires) |
| `apps/storefront/src/modules/devtools/components/devtools-mount/index.tsx` | server component: the one place that decides whether the panel exists for this request |
| `apps/storefront/src/modules/devtools/components/theme-panel/{index,popover,icons}.tsx` | floating button, popover, canon icons |
| `apps/storefront/src/modules/devtools/styles/panel.css` | vendor copy of the 19 geist-kit tokens, scoped to `.updev` |
| `apps/storefront/tests/devtools/{playwright.config.ts,panel.pw.ts,disabled.pw.ts,shots.pw.ts}` | the suites and the acceptance frames |
| edited | `src/app/layout.tsx` (mount), nav / bottom-nav / checkout layout (brand wrapper), `next.config.js`, `package.json`, `README.md`, `.env.template`, `.gitignore` |

## Machine acceptance

| Check | Number | Command |
|---|---|---|
| panel suite | **12 passed**, 0 failed (34.3 s) | `DEVTOOLS_URL=http://host.docker.internal:8000 DEVTOOLS_PASSWORD=… pnpm test:devtools tests/devtools/panel.pw.ts` |
| feature-off suite | **4 passed**, 0 failed (12.6 s) | stand restarted with `STOREFRONT_DEVTOOLS_PASSWORD=`, then `pnpm test:devtools tests/devtools/disabled.pw.ts` |
| reverse runs | **11 of 11 red** | `python3 scratchpad/reverse-runs.py` (10 cases) + the swallow case run by hand |
| reverse runs, feature-off | **3 of 4 red** | the fourth (no markup) is gated by the cookie, whose own reverse run is red |
| `next build` | **EXIT=0**, compiled in 13.7 s | `npx next build` |
| `tsc --noEmit` | 0 errors | `npx tsc --noEmit` |
| `next lint` | 0 warnings, 0 errors | `npx next lint --dir src` |

### What the build shows about the cost to a visitor

| | baseline (before T0i) | after |
|---|---|---|
| static routes | 6 | **6** |
| dynamic routes | 29 | 30 (`/api/devtools/unlock`) |
| First Load JS shared by all | 103 kB | **103 kB** |
| `/[locale]` | 935 B / 133 kB | **935 B / 133 kB** |
| Middleware | 36.6 kB | 36.6 kB |

The root layout reads `cookies()`, and that costs nothing here: next-intl already reads the
locale cookie on every render, so the baseline build had no static page route either.

### Reverse runs, one line each (behaviour removed → the test that must go red)

| Behaviour removed | Test | Verdict |
|---|---|---|
| `HOLD_MS` 2000 → 500 | a 1.5 s press stays a link | RED |
| `onClickCapture` swallow | the click that ends a long press is swallowed | RED |
| `timingSafeEqual` → `true` | a wrong password | RED |
| cookie `httpOnly: false` | the right password sets an httpOnly cookie | RED |
| preset row no longer calls `applyAxis` | flipping the preset | RED |
| mode segment no longer calls `applyAxis` | flipping the mode | RED |
| `resetAxes()` removed | reset puts both axes back | RED |
| pre-paint script removed from `<head>` | before the first paint | RED |
| lock no longer calls the route | lock removes the cookie | RED |
| cookie signature not verified | a forged cookie is refused | RED |
| mount no longer checks the cookie | a visitor's HTML carries neither | RED |
| `isDevtoolsEnabled()` gate removed | 404 POST, 404 DELETE, "not available" | RED ×3 |

One reverse run taught us something: **"a 2 s press does not navigate" stayed GREEN with the
click-swallow removed**, because a modal `<dialog>` makes the rest of the page inert and the
click never reaches the link. A second test was written that takes the inertness away (Esc
closes the dialog while the button is still down), and that one goes red without the swallow.
The first test was kept — it covers the user-visible property; the second covers the code.

### Numbers the panel itself reports

- presets on screen: **7**, ordered alphabetically by label, ids never rendered
  (`Ferrite · Geist · Kerbstone · Larchant · Long Morning · Medusa default · Scruple`)
- source line: **"Rendered from 31 tokens of preset <label>."** — 31 = `THEME_TOKEN_COUNT`,
  written by `scripts/build-themes.mjs`
- axes: **2** (`data-theme`, `data-mode`), both from `src/lib/theme/attributes.ts`; none added
- cookie: `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` — the test asserts the lifetime lands
  between 6.99 and 7.01 days and that `document.cookie` cannot see it

### The storefront really changes (pixels, not opinion)

Header background sampled at (700, 84) in the acceptance frames
(`python3 -c "from PIL import Image; …"`):

| Frame | Header pixel |
|---|---|
| visitor / Kerbstone dark | `(10, 10, 10)` |
| Scruple dark | `(10, 19, 16)` |
| Larchant dark | `(20, 17, 13)` |
| after "Reset to default" (Medusa default, light) | `(255, 255, 255)` |

Worth knowing before the eye acceptance: **in dark mode the seven presets differ by a few
units of RGB in the page colour** — the change is real but quiet. Flip to Light to see presets
change the storefront the way the brief describes. The same measurement is why the popover's
swatches show page + accent rather than page + ink: in dark mode every preset's page is
near-black and its ink near-white, and the seven swatches were indistinguishable.

## Frames for the eye acceptance

`artifacts/docs/stands/devtools-*.png` (10 frames, PNG stays out of git — rule 21f):
`s0-visitor`, `s2-dialog`, `s3-wrong-password`, `s4-button`, `s5-popover`,
`s6-preset-scruple`, `s6-preset-larchant`, `s7-dark`, `s8-reset`, `s11-mobile`.
Regenerate: `DEVTOOLS_SHOTS=1 DEVTOOLS_URL=… DEVTOOLS_PASSWORD=… pnpm test:devtools tests/devtools/shots.pw.ts`.

## Decisions taken along the way (each in one sentence)

1. **Native `<dialog>` + `showModal()`**, not the storefront's modal primitive: it brings the top
   layer, the focus trap, Esc and the backdrop, and it is not dressed in Medusa tokens.
2. **The dialog mounts only after the hold fires.** Rendering it up front put "Storefront devtools
   / Password / Unlock" into the HTML of every visitor — measured with curl before the change.
3. **The button sits in one `position: fixed` root with the popover**, which is laid out inside it
   (`bottom: 100%`): no rect is measured, and no ancestor's transform or overflow can move it.
4. **`devIndicators: { position: "bottom-right" }`** in `next.config.js`: Next's dev badge defaults
   to the same corner and its `<nextjs-portal>` intercepts the pointer events over the button —
   measured on the stand as a click timeout. Dev-only; a production build is unaffected.
5. **English UI, not 36 next-intl catalogs**: this is a developer tool a shopper never sees.
6. **Swatch shows page + accent** — see the pixel table above.

## Open / deferred

- The vendor copy of `geist-kit/tokens.css` must be registered as an instance of entity `d4` in
  `design-docs/registry/entities.json`, which belongs to another project (rule 5k). Deferred as
  queue entry **`pr-20260908232215-5955`** (`node ~/upready/.ai/scripts/pending-registrations.mjs`),
  drift: selector `.updev` instead of `:root`, mode switch under `[data-mode="dark"]`.
- Fonts and radius are not in the panel today (rule 32a); the popover's section list is a loop, so
  T0j/T0k's `data-card` / `data-image-*` arrive as `AXES` entries plus one section each.
- The stand's password is `t0i-panel-2026`, in `apps/storefront/.env.local` (not in git).
