# Retro — the output and its gates (`sneakers` pilot)

Written 2026-09-07 by the retro agent for the artefact-and-gates lens. Worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`, stand `http://localhost:8028`
(storefront) + `http://localhost:9023` (backend), preset `sneakers`, default mode dark.

Inputs read: `artifacts/registries/theme-surface-defects.json` (14 defects, 3 root causes),
`apps/backend/src/migration-scripts/data/profiles/sneakers/design/style-board.md` §3/§5/§6/§7/§8.1,
`artifacts/docs/2026-09-07-s6a-theme-assembly-report.md`, `artifacts/docs/2026-09-07-s1b-theme-bridge-report.md`,
`apps/storefront/src/styles/themes.css`, `specs/design-system/token-map.json`, the profile's `theme.json`.

**Every colour below is a computed value read from the live stand with Playwright (chromium-1243), with the
route, mode, viewport and element it came from.** Nothing is inferred from source. Source is quoted only to
name the cause of a value already measured. The probe scripts are in the session scratchpad
(`/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/ccc5a0e2-831d-4ab7-87ca-71766c640573/scratchpad/probe.mjs`,
`probe-dropdowns.mjs`, `probe-tables.mjs`) with the raw JSON per scan under `scratchpad/probe/`; nothing of
that is in the repository.

## 0. Five findings, sharpest first

1. **`body` is unpainted on all 81 scans** (`rgba(0, 0, 0, 0)` / `rgb(0, 0, 0)`), and the consequence is not
   thirteen pages but every surface: 86 elements read `rgb(0, 0, 0)` on `rgb(10, 10, 10)` (1.06:1) across 28 of
   the 41 dark scans, including the whole account area the owner never opened (mobile account nav
   *Profile / Addresses / Orders / Log out*, "Hello …", "Questions and answers", the search overlay's "Popular
   products"). In light mode the same 75 elements are black on white — they pass contrast by accident and
   are still the UA default, not `--foreground`.
2. **The account area is the worst surface in the store and nobody measured it.** `/en/account/profile` in
   dark mode: 102 text elements, 36 contrast failures, 38 off-palette; every input renders its value in
   `rgb(0, 0, 0)` on `rgb(24, 24, 24)` (1.18:1, 40 inputs across the area), placeholders are Tailwind
   `gray-400` `rgb(156, 163, 175)`, required-field asterisks are `text-rose-500`, and the error toast is
   **grey** (`rgb(129, 129, 129)` on `rgb(13, 13, 13)`) because the dark bridge row `--tag-red-text` anchors on
   `--chart-4`, which S6a set to `#454545`.
3. **Focus never reaches `--ring`.** Over 8 Tab walks (4 pages × 2 modes, ~30 stops each) the token appears
   on exactly one element (the PDP thumbnail button, `rgb(214, 255, 59) 0 0 0 1px`). 20–27 stops per page show
   Chrome's own `outline: auto 1px rgb(0, 95, 204)`; every input shows Medusa blue `rgb(96, 165, 250)` /
   `rgba(59, 130, 246, .5)` from the bridge's 28 *open* rows (`--borders-interactive-with-focus`); option
   buttons show `outline: auto 3px currentColor`. Defect C is not "18 sites" — it is the absence of any
   focus-visible rule plus a bridge that ships the vendor's blue by design.
4. **Two bridge-derived colours fail WCAG in both modes and are on every page.** `--fg-muted` computes to
   `rgb(106, 106, 106)` on ink (3.66:1, 28 uses: breadcrumb "Home", checkout "Shipping address", search
   placeholder) and `rgb(122, 122, 122)` on white (4.29:1, 70 uses: footer copyright, breadcrumbs).
   `--fg-disabled` on `--bg-disabled` is `rgb(70, 70, 70)` on `rgb(31, 31, 31)` (1.75:1) and
   `rgb(169, 169, 169)` on `rgb(240, 240, 240)` (2.06:1) — the disabled add-to-cart and "Select a payment
   method" of d-11. The style board's "26 pairs, 0 failures" is true of the canon pairs and says nothing
   about the 85 derived rows the page actually paints with.
5. **Nine of the sixteen board pairs are painted nowhere.** `--card`, `--popover`, `--accent-foreground`,
   `--destructive`, `--warning` and their partners do not occur on any of the 81 scans: product cards sit on
   `--background`, the size dropdown's panel is `bg-ui-bg-base`, errors are the grey above. The preset
   compiles 31 keys and the storefront consumes 7 of them. A coverage gate on values alone would pass the hero
   CTA too — it is a **white pill** (`rgb(255, 255, 255)` / `rgb(10, 10, 10)`) in both modes, a palette pair
   in light and off-palette in dark, and in neither is it the `--primary` block §8.1 commits to; the gate in §2
   therefore carries role anchors (R14), not just palette membership.

Also measured, not in the owner's list: the wordmark on every page is **"Upready Store"** (`[nav-store-link]`
text, `<title>` "Cart | Upready Store", footer "© 2026 Upready Store", "Powered by") — the profile's brand name
appears nowhere in the chrome; card hover changes nothing (`border rgb(38, 38, 38) → rgb(38, 38, 38)`, title
`text-decoration none → none`, both modes), so §7's `--border → --ring` hover is not implemented; and one scan
of 81 (`/en/account/orders`, light, 1280) rendered `data-mode="dark"` despite the stored light preference.

## 1. Measurement — what nobody had looked at

### 1.1 Method

One Playwright script per run against the live stand; no restart, no rebuild. For each surface × mode ×
viewport the in-page walker visits every rendered element and records: for text elements (own text node, or
`input`/`textarea`/`select` value and `::placeholder`) the computed `color` and the **effective background**
(ancestors composited until the first opaque `background-color`; `html`'s computed background is the canvas;
a `background-image` ends the walk as `gradient/image`); for every element with its own background the
colour and area; for every visible border its colour; then 40 `Tab` presses reading `outline`, `box-shadow`
and `:focus-visible` on `document.activeElement`; and on the category page the card's border, shadow and
title decoration before and after `hover()`. Mode is forced through `localStorage["upready-store.mode"]` in
an init script (the pre-paint reads it) and read back from `html[data-mode]`. Viewports 1280×800 and
390×844. Classification: a colour is *in palette* if it equals (±0) one of the 19 hex tokens of
`theme.json` for the active mode; contrast is WCAG 2.1 with floor 4.5, or 3.0 for ≥ 24 px / ≥ 18.66 px bold.

Totals: **81 scans, 3 071 text elements: 774 below the contrast floor (20 distinct colour/background
pairs), 643 in-contrast but off-palette (25 distinct pairs), 1 654 palette-on-palette passes (13 distinct
pairs).** Dark: 41 scans, 1 559 elements, 607 failures. Light: 40 scans, 1 512 elements, 167 failures.

Two limits of the method, stated so nobody reads them as findings: (a) text positioned over an `<img>`
sibling (the hero headline, subheadline) is reported against the ancestor chain, so "white on white" for the
light-mode hero is a false positive — the hero is white type over a dark photograph with a `from-black/70`
gradient, visible in `home__light__desktop.png`; (b) the mobile drawer's panel is `rgba(3,7,18,.5)` with
`backdrop-blur`, so its effective background varies with what is behind it; the composite reported below is
over `html`.

### 1.2 Surfaces reached and not reached

Reached, both modes, both viewports unless noted: home, `/en/store`, `/en/categories/high-tops`,
`/en/products/gutter-low` (nothing chosen, and options chosen at 1280), `/en/cart` empty and with one item,
cart dropdown empty and with one item (1280), search overlay empty and with results (1280 and 390), mobile
drawer (390), `/en/account` login and register form, `/en/reset-password`, `/en/contact`, the not-found page
via `/en/order/does-not-exist/confirmed`, and — after registering `probe-<timestamp>@example.com` on the
stand's own database `upready_store_sneakers` — the account **dashboard, orders, addresses, profile**, the
authenticated **checkout** with its contacts and address sheets (1280).

**Not reached, reported as unreached:**

| Surface | Why |
|---|---|
| Order confirmation with a real order (`/en/order/<id>/confirmed`) | The checkout's address sheet has inputs without `name` attributes (measured: `[{"name":"","type":"checkbox"},{"name":"","type":"text"},…]`), the automated fill could not target them and the sheet's submit click timed out after 30 s in both modes; no order exists in the database (`select count(*) from "order"` → 0). What was measured instead: the not-found page the route renders for an unknown id. A store-API fixture (§2.2) is the way in, not UI automation. |
| Account order details, order transfer accept/decline | Need the order above. |
| Checkout sign-in prompt (d-13's white block) | Only the authenticated checkout was scanned; the prompt renders for guests. |
| Checkout after delivery/payment chosen, "Select a payment method" open | Blocked at the address sheet. |
| PDP mobile sticky bar and `mobile-actions-modal` | Not scripted in this run. |
| Native `<select>` open lists (region/country) | OS-drawn, not in the DOM. |
| Skeleton / `loading.tsx` states | Need a throttled data fetch; not scripted. The 79 literal `bg-gray-*` occurrences are source facts from the registry, not measured here. |
| Hover/active/pressed on anything except the product card; focus beyond 40 Tab stops per page | Not scripted. |

### 1.3 Root: body and the inherited black

`getComputedStyle(document.body)` on all 81 scans: `backgroundColor rgba(0, 0, 0, 0)`, `color rgb(0, 0, 0)`.
`html` carries `--background #0a0a0a` / `--foreground #ededed` in dark and paints `rgb(10, 10, 10)` itself
(`html { @apply bg-ui-bg-base }`), so any element that names no colour inherits UA black:

| Route · mode · viewport | Element | Colour | Background (from) | Ratio | In board table |
|---|---|---|---|---:|---|
| `/en/account` (dashboard) · dark · 1280 & 390 | `h3.text-base-semi` "Account", `button[logout-button]` "Log out", `h2.text-xl-semi` "Questions and answers" | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` (html) | 1.06 | no — colour is no token |
| `/en/account` mobile account nav · dark · 390 | `Profile / Addresses / Orders / Log out` rows | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| `/en/account/orders` · dark | `h2.h2-core.!text-sm` "Order transfers" | `rgb(10, 10, 10)` | `rgb(10, 10, 10)` | 1.00 | no (background on background) |
| search overlay · dark · 1280 & 390 | `p.txt-compact-xsmall-plus` "Popular products" | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` (dialog panel `bg-ui-bg-base`) | 1.06 | no |
| `/en/cart`, `/en/reset-password`, `/en/categories/high-tops`, `/en/contact`, not-found · dark | `h1`, `h2`, body copy | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| the same 75 elements · light | — | `rgb(0, 0, 0)` | `rgb(255, 255, 255)` | 21.0 | no — passes by accident, `--foreground` is `#0a0a0a` |
| mobile bottom nav · both modes · 390 | two `a` items (home, account icons) | `rgb(0, 0, 0)` | nav `rgb(10, 10, 10)` dark / `rgb(255, 255, 255)` light | 1.06 / 21 | no |

86 occurrences in dark across 28 of 41 dark scans; 75 in light. One rule (`body { background: var(--background); color: var(--foreground) }`) closes all of them; the gate's R2 (§2.6) is the one-line check.

### 1.4 Account area (dashboard, orders, addresses, profile) — never opened before

| Route · mode | Element | Colour | Background (from) | Ratio | In board table |
|---|---|---|---|---:|---|
| `/en/account/profile` · dark | every `input.pt-4.pb-1[first-name-input]` etc. — value text (40 inputs across login/register/profile) | `rgb(0, 0, 0)` | `rgb(24, 24, 24)` (input `bg-ui-bg-field` = `--border` 50 % over html) | 1.18 | no |
| `/en/account/profile` · light | the same inputs | `rgb(0, 0, 0)` | `rgb(245, 245, 245)` (`--muted`) | 19.3 | no — UA black, not `--foreground` |
| all forms · dark | `::placeholder` of those inputs | `rgb(156, 163, 175)` (Tailwind `gray-400`) | `rgb(24, 24, 24)` | 6.99 | no |
| all forms · light | `::placeholder` (35 elements) | `rgb(156, 163, 175)` | `rgb(245, 245, 245)` | **2.33** | no |
| `/en/account`, profile, sheets · both | `span.text-rose-500` "*" (required marks, 60 elements) | `rgb(244, 63, 94)` | `rgb(10, 10, 10)` / `rgb(255, 255, 255)` | 5.39 / **3.67** | no — `--destructive` is `#ff6166` / `#d40000` |
| `/en/account/profile` · dark | error toast "We could not save the changes" (`span.bg-ui-tag-red-bg.text-ui-tag-red-text`) | `rgb(129, 129, 129)` | `rgb(13, 13, 13)` | 4.99 | no — grey: dark `--tag-red-text` = `--chart-4` (#454545) 64.5 % over `--foreground` |
| `/en/account/profile` · light | the same toast | `rgb(137, 4, 4)` | `rgb(244, 244, 244)` | 9.17 | no (bridge-derived from `--destructive`; correct hue) |
| `/en/account/profile` · dark | success toast "Name updated successfully" | `rgb(214, 255, 59)` (`--success`) | `rgb(47, 47, 47)` (`--chart-2` 24.5 % over bg) | 11.6 | no (bridge-derived) |
| `/en/account/orders` · dark | `input[placeholder="Order link or ID"]` placeholder | `rgb(106, 106, 106)` (`--fg-muted`) | `rgb(24, 24, 24)` | **3.28** | no |
| `/en/account/orders` · light | the same | `rgb(122, 122, 122)` | `rgb(245, 245, 245)` | **3.94** | no |
| `/en/account/orders` · dark | `p.text-neutral-500` "Can't find the order you are looking for?" | `rgb(115, 115, 115)` | `rgb(10, 10, 10)` | **4.18** | no |
| `/en/account/orders` · dark | `button[transfer]` "Request transfer", the order-id input | `rgb(237, 237, 237)` | `rgb(24, 24, 24)` | 15.2 | no (bg is bridge-derived `--bg-field`) |
| `/en/account/profile` · dark | `select[billing-country]` | `rgb(106, 106, 106)` | `rgb(26, 26, 26)` | **3.22** | no |
| `/en/account/addresses` · both | `button[add-address-button]` border | `rgb(51, 51, 51)` dark / `rgb(212, 212, 212)` light | — | — | no — `--border` is `#262626` / `#e4e4e4` |
| account, every route · dark | header `[nav-store-link]` "Upready Store", "en", footer column heads "Categories" | `rgb(161, 161, 161)` / `rgb(237, 237, 237)` | `rgb(255, 255, 255)` (`header`, `footer.bg-white`) | **2.58** / **1.17** | no |
| account, every route · both | promo strip `[promo-banner-text]` | `rgb(250, 250, 250)` | `rgb(23, 23, 23)` (`div.bg-neutral-900`) | 17.2 | no — literal `neutral-50` on `neutral-900`, unchanged by mode |

Per-surface totals (dark, 1280): dashboard 37 text elements / 20 below floor / 3 off-palette; orders 37 / 21 / 5; addresses 29 / 18 / 3; profile 102 / 36 / 38. Light: 37 / 2 / 7; 37 / 2 / 5 (390; the 1280 light scan rendered dark, see §1.10); 29 / 2 / 5; 102 / 26 / 26.

### 1.5 Search overlay (1280 and 390, both modes)

| Element | dark | light | Ratio d / l | In board table |
|---|---|---|---:|---|
| dialog panel `div.max-w-xl` | `rgb(10, 10, 10)` (`--background`) | `rgb(255, 255, 255)` | — | yes (surface) |
| scrim behind it | `rgb(0, 0, 0)` @ 0.3 | same | — | no (literal `bg-black/30`; the canon has no scrim token — s1b's open row) |
| input placeholder "Search products" | `rgb(106, 106, 106)` on `rgb(10, 10, 10)` | `rgb(122, 122, 122)` on white | **3.66 / 4.29** | no — `--fg-muted` |
| "Popular products" label | `rgb(0, 0, 0)` on `rgb(10, 10, 10)` | `rgb(0, 0, 0)` on white | **1.06** / 21 | no |
| result rows (8 / 6 elements) | `rgb(41, 41, 41)` (`--bg-component`: `--secondary` 93 % over `--foreground`) | `rgb(245, 245, 245)` (`--secondary`) | — | light yes; dark no (bridge-derived) |
| `mark` highlight "low" | `rgb(214, 255, 59)` on `rgb(39, 44, 17)` (`--bg-highlight`) | `rgb(76, 102, 0)` on `rgb(243, 245, 238)` | 12.5 / 5.96 | no (bridge-derived, passes) |
| result title / price | `rgb(237, 237, 237)` / `rgb(161, 161, 161)` on `rgb(41, 41, 41)` | on `rgb(245, 245, 245)` | 5.63 (muted on component) | no (bridge-derived) |

The overlay is the best-themed surface in the store — its panel and rows come through the bridge — and it
still carries the inherited black label and a sub-floor placeholder.

### 1.6 Checkout (authenticated, both modes, both viewports) and its sheets

| Element | dark | light | Ratio | In board table |
|---|---|---|---:|---|
| summary column `div.flex.flex-col.gap-y-8.px-4` | `rgb(245, 245, 245)` | `rgb(255, 255, 255)` | — | dark **no** (literal; 8.6 M px² over the two dark scans); light yes by coincidence |
| `[cart-total]` "IDR 2,196,199" | `rgb(237, 237, 237)` on `rgb(245, 245, 245)` | `rgb(10, 10, 10)` on white | **1.07** / 19.8 | dark no |
| `[cart-subtotal]`, "1 item" and 18 more muted spans | `rgb(161, 161, 161)` on `rgb(245, 245, 245)` | `rgb(92, 92, 92)` on white | **2.37** / 6.69 | dark no |
| "Edit", "Add a promotion code" (`text-ui-fg-interactive`) | `rgb(214, 255, 59)` on `rgb(245, 245, 245)` | `rgb(76, 102, 0)` on white | **1.06** / 6.55 | dark no |
| "Select a payment method" (disabled button) and PDP "Select variant" | `rgb(70, 70, 70)` on `rgb(31, 31, 31)` | `rgb(169, 169, 169)` on `rgb(240, 240, 240)` | **1.75 / 2.06** | no — `--fg-disabled` on `--bg-disabled` (= `--accent`); this is d-11, measured |
| `h2.text-ui-fg-muted` "Shipping address", `p.text-ui-fg-muted` "Choose how you want your order delivered" | `rgb(106, 106, 106)` on `rgb(10, 10, 10)` | `rgb(122, 122, 122)` on white | **3.66 / 4.29** | no — `--fg-muted` |
| contacts sheet, address sheet (`[role=dialog]`) — panels | 0 of 4 surfaces off-palette in either mode | | | yes |
| sheet inputs / placeholders / asterisks | as §1.4 (`rgb(0, 0, 0)` values on `rgb(24, 24, 24)`; `gray-400` placeholders; `rose-500` marks) | | 1.18 / 2.33 / 3.67 | no |

Focus on the checkout (Tab walk, 1280): 20 stops on `auto 1px rgb(0, 95, 204)` (UA), one country-select
button on the bridge's Medusa blue (`rgb(96, 165, 250)` dark / `rgb(37, 99, 235)` light), zero on `--ring`.

### 1.6b Cart, cart dropdown, listing chips — the owner's defects with numbers, plus one he did not list

| Route · mode | Element | Colour | Background (from) | Ratio | In board table |
|---|---|---|---|---:|---|
| cart dropdown `[nav-cart-dropdown]` · dark · 1280 | panel 420×293 | — | `rgb(255, 255, 255)`, border `rgb(229, 231, 235)` (`gray-200`) | — | no (d-09) |
| cart dropdown · dark | `h3.text-large-semi` "Cart", `span` "Your shopping bag is empty." | `rgb(237, 237, 237)` | `rgb(255, 255, 255)` | **1.17** | no — `--foreground` on a literal white |
| cart dropdown, empty · both | count badge `div.bg-gray-900` "0" | `rgb(255, 255, 255)` | `rgb(17, 24, 39)` | 17.7 | no — `gray-900` in both modes |
| cart dropdown with item, `/en/cart` · both · both viewports | `span[cart-item-count]` "1" | `rgb(255, 255, 255)` | `rgb(0, 0, 0)` | 21 | no — `bg-black text-white` (d-10) |
| cart dropdown with item · dark | quantity `−` `1` `+` (`text-ui-fg-subtle`) | `rgb(161, 161, 161)` | `rgb(41, 41, 41)` (`--bg-component`) | 5.63 | no (bridge-derived, passes) |
| `/en/cart` with item · dark · both viewports | thumbnails `div.w-24.h-24.rounded-[6px]` | — | `rgb(41, 41, 41)` | — | no (bridge-derived); radius `6px` literal on a 4 px preset |
| `/en/store`, `/en`, category, PDP · dark · 1280 | size chips on every card `div.first:ps-0.px-2` "38" "39" … (87 per store scan, 238 across scans, 11 px) | `rgb(208, 208, 208)` | `rgb(10, 10, 10)` | 12.8 | **no** — in light the same chips are `rgb(92, 92, 92)` = `--muted-foreground`, so dark carries a `dark:` literal |
| PDP option buttons · dark | `button.w-10.h-10.rounded-lg[option-button]` border (36 elements) | — | border `rgb(41, 41, 41)` 4 px, `rounded-lg` | — | no — neither `--border` (`#262626`) nor `--ring`; 8 px radius |
| PDP option button, selected · light | `button[option-button]` "38" | `rgb(10, 10, 10)` | `rgb(239, 239, 239)` | 17.2 | no — near `--accent #f0f0f0` but not it |

### 1.7 Light mode of the sneakers preset — first render

Light had never been rendered (s1b, s6a both say so). Measured now, 40 scans:

- `html[data-mode="light"]`, `--background #ffffff`, `--foreground #0a0a0a`, html paints `rgb(255, 255, 255)`; body still `rgba(0, 0, 0, 0)` / `rgb(0, 0, 0)`.
- The white header and footer, the checkout column and the cart dropdown **coincide** with `--background`, so the literal-white class of defects (d-07, d-08, d-09, d-10, d-13) is invisible in light — 167 contrast failures against 607 in dark. They are the same classes and will reappear on the first light preset whose background is not `#ffffff`.
- What light mode fails on its own: `gray-400` placeholders `rgb(156, 163, 175)` on `rgb(245, 245, 245)` **2.33:1** ×35; `text-rose-500` on white **3.67:1** ×28; `--fg-muted` `rgb(122, 122, 122)` on white **4.29:1** ×70 (footer "© 2026 Upready Store", "Powered by", breadcrumb "Home"); disabled buttons **2.06:1**; "Order link or ID" placeholder **3.94:1**; `select[billing-country]` `rgb(122, 122, 122)` on `rgb(245, 245, 245)` 3.94.
- The promo strip stays `rgb(23, 23, 23)` with `rgb(250, 250, 250)` text — a black bar on the white page (`home__light__desktop.png`), the one dark surface in light mode, because it is `bg-neutral-900`, not `--secondary`.
- The hero CTA `a[profile-hero-cta]` "Shop the drop": `rgb(255, 255, 255)` background, `rgb(10, 10, 10)` label, `rounded-full` — the same white pill as in dark. §3.1 says light `--primary #0a0a0a` / `--primary-foreground #d6ff3b` and §8.1 "never an outline button". Palette-valid pair, wrong tokens: R14.
- The polarity flip loses the acid. Dark add-to-cart: `rgb(10, 10, 10)` on `rgb(214, 255, 59)` (ink on acid, 17.2:1, correct). Light add-to-cart `[add-product-button]`: `rgb(255, 255, 255)` on `rgb(10, 10, 10)` — a **white** label on the ink block, not `--primary-foreground #d6ff3b`. The label class resolves to Medusa's `fg-on-color` (bridge: `--destructive-foreground`, white in light), not `fg-on-inverted` (`--primary-foreground`); in dark the two coincide at `#0a0a0a`, which is why the dark button looks right. Measured on `/en/products/gutter-low` with options chosen, 1280, and on the cart/checkout CTAs (18 elements of that pair in light).
- Light `--link` `rgb(76, 102, 0)` on white 6.55:1 ×21, on `--secondary` 6.0 ×4, on `--border` 5.15 ×8: all pass.
- Card hover in light: `rgb(228, 228, 228) → rgb(228, 228, 228)`, title `none → none`.
- Focus in light: same UA blue; `nav-menu-button` gets `solid 3px rgb(92, 92, 92)` (`--muted-foreground`), inputs `rgba(37, 99, 235, .2) 0 0 0 4px`.

### 1.8 390×844 — the pages already known broken, plus the drawer and bottom nav

| Route · mode | Element | Colour | Background (from) | Ratio | In board table |
|---|---|---|---|---:|---|
| every route · dark · 390 | `header` 390×64 | — | `rgb(255, 255, 255)` | — | no |
| every route · dark · 390 | `footer.bg-white` 390×576 (the "white bar" at the bottom of every mobile screenshot) | — | `rgb(255, 255, 255)` | — | no |
| `/en/cart` · dark · 390 | `h1` "Cart" | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| `/en/reset-password` · dark · 390 | `h2` | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| `/en/categories/high-tops` · dark · 390 | `h1` | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| `/en/account` mobile account nav · dark · 390 | 4 rows | `rgb(0, 0, 0)` | `rgb(10, 10, 10)` | 1.06 | no |
| drawer `[nav-menu-popup]` · dark · 390 | `a[home-link]`, `[store-link]`, `[account-link]`, cart (30 px) | `rgb(10, 10, 10)` (`text-ui-fg-on-color` = `--destructive-foreground`) | `rgb(129, 131, 137)` (`bg-[rgba(3,7,18,0.5)]` over html) | 5.22 | no — panel is a literal navy |
| drawer · light · 390 | the same links | `rgb(255, 255, 255)` | `rgb(129, 131, 137)` | 3.79 (floor 3) | no |
| bottom nav `nav.fixed.bottom-0` · both · 390 | bar | — | `rgb(10, 10, 10)` / `rgb(255, 255, 255)` | — | **yes** — `bg-ui-bg-base` |
| bottom nav · both | search / menu buttons | `rgb(161, 161, 161)` / `rgb(92, 92, 92)` | as above | 7.66 / 6.69 | yes |
| bottom nav · both | home and account `a` | `rgb(0, 0, 0)` | as above | 1.06 / 21 | no (inherited) |
| search overlay · both · 390 | as §1.5 | | | | |
| `/en/products/gutter-low` · dark · 390 | option buttons (12 size, 3 colour) on focus | `outline: auto 3px rgb(0, 0, 0)` / `rgb(237, 237, 237)` | — | — | no — `outline: auto` in `currentColor`; `--ring` unused |

Mobile scans carry fewer elements (43 vs 101 on home) because the desktop-only nodes are `display:none`;
the failure classes are identical.

### 1.9 The listing dropdowns (d-03 / d-04), the card hover and the focus walk

Category page, 1280, both modes (`probe-dropdowns.mjs`):

- Triggers are Medusa `input[role="combobox"]` (`txt-compact-small text-ui-fg-base … cursor-pointer`): at rest transparent, `border rgb(38, 38, 38)`; on focus `background rgb(31, 31, 31)` (`--accent`, dark) / `rgb(240, 240, 240)` (light), `outline: solid 2px rgba(0, 0, 0, 0)`, `box-shadow none`, `:focus-visible` true — **no ring at all** on the trigger, in either mode.
- The open list `div.shadow-elevation-flyout.bg-ui-bg-base.rounded-[8px]`: background `rgb(10, 10, 10)`, `box-shadow … rgba(255, 255, 255, 0.08) 0 0 0 1px inset` (`--shadow-float`, canon), **rows** `div.transition-fg.bg-ui-bg-base` "40", "41", … `color rgb(0, 0, 0)` on `rgb(10, 10, 10)` — **1.06:1**. This is the "size numbers near-black" of d-04, measured: inherited black, cause A, inside a panel that is otherwise themed. The panel uses `--background`, not `--popover` (`#161616`), so the board's `popover-foreground on popover` row is not exercised here either.
- The `rounded-[8px]` panel and `rounded-lg` option buttons on the PDP are 8 px on a 4 px preset (`--radius 0.25rem`): literal radii, not tokens.
- Sort button "Latest arrivals": `rgb(237, 237, 237)` on `rgb(10, 10, 10)`, `shadow-buttons-neutral` = the bridge's open row (`rgba(255,255,255,.06)` stack) — WARN class.

Card hover (`a[href*="/products/"]`, first card, 1280): dark `border rgb(38, 38, 38) → rgb(38, 38, 38)`,
inner `rgb(38, 38, 38) → rgb(38, 38, 38)`, shadow `none → none`, title `text-decoration none → none`; light
`rgb(228, 228, 228) → rgb(228, 228, 228)`, `none → none`. Nothing changes on hover. §7 commits to
`--border → --ring` plus a title underline; §8.1 says hover and focus must differ — today neither exists.

Focus walk (PDP, login, profile, checkout × dark/light, 40 stops each):

| Signature | Stops (of ~30 per page) | Where | In palette |
|---|---:|---|---|
| `outline: auto 1px rgb(0, 95, 204)`, no shadow | 20–27 per page | header buttons, nav links, region select, footer links, breadcrumbs, back-to-cart | no — Chrome UA default |
| `outline: solid 2px transparent` + `rgb(96, 165, 250) 0 0 0 1px, rgba(59, 130, 246, .5) …` (dark) / `rgba(37, 99, 235, .2) 0 0 0 4px …` (light) | every `input` (2 on login, 11 on profile), country-select button | forms | no — Medusa blue from the bridge's open rows `--borders-interactive-with-focus` |
| `outline: auto 3px rgb(0, 0, 0)` / `rgb(237, 237, 237)` / `rgb(10, 10, 10)` | 12 option buttons | PDP | no — `currentColor` |
| `outline: solid 3px rgb(161, 161, 161)` / `rgb(92, 92, 92)` | 1 (`nav-menu-button`) | header | palette colour, wrong token (`--muted-foreground`, not `--ring`) |
| `rgb(214, 255, 59) 0 0 0 1px` / `rgb(76, 102, 0) 0 0 0 1px` | **1** (`button.h-[118px]` thumbnail) | PDP | **yes — the only `--ring` on the walk** |
| `solid 2px transparent`, Medusa button stack `rgba(255,255,255,.12) …` | sign-in, save, edit buttons | forms | no — open rows `--buttons-*` |

### 1.10 Mode application

80 of 81 scans rendered the requested mode. `/en/account/orders` at 1280 in the light context rendered
`html[data-mode="dark"]` (its 390 sibling, 20 s later in the same context, rendered light). Not reproduced,
not explained; recorded because the gate's first rule (R1) exists for exactly this and because the T0h.5
behaviour test only proves the pre-paint on a page it loads itself.

### 1.11 Board pairs against the page

The 16 pairs of style board §3.2, per mode, and whether that colour pair was painted **anywhere** on the 81 scans:

| Pair | dark on page | light on page |
|---|---|---|
| foreground on background | yes, 261 | yes, 357 |
| muted-foreground on background | yes, 134 | yes, 656 |
| primary-foreground on primary | yes, 21 (add-to-cart) | yes, 21 |
| secondary-foreground on secondary | yes, 26 | yes, 29 |
| muted-foreground on muted | no | yes, 35 |
| link on background / ring on background / primary on background (same colours) | yes, 24 | yes, 21 |
| card-foreground on card (`#101010`) | **no — `--card` is painted nowhere** | no (coincides with background) |
| popover-foreground on popover (`#161616`) | **no — `--popover` is painted nowhere** | no (coincides) |
| accent-foreground on accent | **no** (accent appears only as `--bg-disabled` under `--fg-disabled`) | no |
| destructive-foreground on destructive | **no** | no |
| muted-foreground on card, link on card | no | no |
| warning on background | **no** | no |
| border on background (info) | yes | yes |

Seven of sixteen in dark, eight in light. The remaining nine are compiled into `themes.css`, verified by the
board's script, and reach no pixel. A gate that reads the board proves nothing about the page; the gate in
§2 reads the page.

### 1.12 Off-palette paint that is legitimate, so the gate does not flag it

- Colourway swatch dots `span.size-3.rounded-full` — `rgb(138, 138, 138)`, `rgb(74, 20, 24)`, `rgb(31, 42, 46)`, `rgb(232, 228, 220)` (Concrete, Oxblood, Diesel, Chalk): product data, not UI. The gate allow-lists `[data-swatch]`.
- Bridge-derived surfaces and inks (`--bg-field` `rgb(24, 24, 24)`, `--bg-component` `rgb(41, 41, 41)`, `--bg-highlight` `rgb(39, 44, 17)`, `--tag-*-bg`) — derived from tokens by `color-mix`, legitimate as *values*; two of them (`--fg-muted`, `--fg-disabled`) fail the floor and are reported in §0.4 as contrast, not as palette.
- Hero scrim gradients `from-black/70` — the only gradients found (2 elements on home); the gate wants them declared (`data-theme-scrim`) rather than guessed.

## 2. The gate that would have caught this — `theme:coverage`

### 2.1 What the pilot's gate proved, and what it could not

T0h.5 (`apps/storefront/tests/theme/compat.pwspec.ts`) screenshots four pages twice — once with `[data-theme-bridge="off"]` (raw vendor variables) and once with the `medusa`/`light` preset through the bridge — and demands the two differ by under 0.1 % of 1280×800. That is a **regression proof**: it certifies that the bridge, under the preset that reproduces the vendor look, changes nothing. It was run against the demo catalog (`/en/products/t-shirt`, `/en/categories/shirts`), in light mode only, at one viewport, with every image replaced by a transparent pixel. By construction it cannot fail on a surface the preset never reaches — `bg-white` on the header is *identical* in both passes, so it contributes 0 diff pixels and passes.

The replacement is a **coverage proof**: with the profile's own preset active, every rendered colour on every surface must be a value the preset defines, and every text/background pair must clear the WCAG floor. It fails on exactly the defects in `theme-surface-defects.json` and on the ones in §1 that nobody had seen.

### 2.2 Where it lives and how it runs

| Item | Value |
|---|---|
| Spec | `apps/storefront/tests/theme/coverage.pwspec.ts` (Playwright, same `playwright.theme.config.ts` and container as T0h.5) |
| Scanner | `apps/storefront/tests/theme/lib/scan-surface.ts` — the in-page walker; pure function, unit-tested with vitest on a fixture DOM |
| Fixtures | `apps/storefront/tests/theme/fixtures.mjs` — creates the probe customer and one completed order through the **store API** (`/store/customers`, `/store/carts`, `pp_system_default` payment session, `/store/carts/:id/complete`) against the stand's backend, before the suite; idempotent (looks up `probe-coverage@example.com` first) |
| Script | `pnpm --filter storefront theme:coverage` → runs fixtures, then the spec; `THEME_URL` as today; `THEME_PROFILE` defaults to the built profile |
| Expected tokens | read at start-up from `src/lib/profile/profile.generated.json` (`theme.presetId`, `theme.defaultMode`) → `specs/design-system/themes/<presetId>.theme.json` → `modes.{light,dark}.tokens`. **Never** from `themes.css` (that is the artefact under test) and never from the style board (a document, not a measurement) |
| Matrix | every surface in §2.3 × `{dark, light}` × `{1280×800, 390×844}`; mode is forced with `context.addInitScript(() => localStorage.setItem("upready-store.mode", m))` and **asserted** on `html[data-mode]` before scanning (a scan under the wrong mode is a failure, not a skip) |
| Exit | non-zero on any FAIL; WARN rows are counted and printed but do not block until the canon question in §2.6 is decided |
| Budget | ~26 surfaces × 4 = 104 scans; the probe behind §1 did 60 in 4 min 40 s on the dev server, so ≈ 8 min |

### 2.3 Surfaces — routes, how each is reached, and the anchors that must exist

A surface is a route **plus** the state it has to be put in. Every surface names one or more anchors: selectors that must be present and visible, otherwise the surface fails with `anchor-missing` — this is what stops an empty page (a 404 body, a redirect to login, a skeleton that never resolved) from passing as clean.

| # | Surface | How it is reached | Anchors (must be visible) |
|---|---|---|---|
| S01 | home | `/en` | `h1`, hero CTA `a[href$="/store"]`, first tile label, `[data-testid="promo-banner-text"]`, `header`, `footer` |
| S02 | store listing | `/en/store` | `h1`, ≥ 1 `[data-testid="product-title"]`, a price |
| S03 | category | `/en/categories/<first handle in profile home.tiles>` | `h1`, ≥ 1 product title |
| S04 | PDP, nothing chosen | `/en/products/<first catalog handle>` | title, price, `[data-testid="option-button"]`, `[data-testid="add-product-button"]` **disabled** |
| S05 | PDP, options chosen | S04 + click first `option-button` in every `[data-testid="product-options"]` group | `add-product-button` **enabled** |
| S06 | PDP option dropdown open (the two defects d-03/d-04) | S04 + click each option trigger (`select`, or the Listbox button) and scan the open list | ≥ 2 option rows |
| S07 | PDP mobile sticky bar | S05 at 390×844, scrolled 800 px | `[data-testid="mobile-actions-button"]`; then click → `[data-testid="mobile-actions-modal"]` |
| S08 | cart, empty | `/en/cart` in a fresh context | `h1`, the "explore" link |
| S09 | cart, with items | after fixture add-to-cart | `[data-testid="items-table"]`, `[data-testid="cart-total"]` |
| S10 | cart dropdown, empty / with items | hover `[data-testid="nav-cart-link"]` at 1280 | the panel with the Cart heading; the count badge when items exist |
| S11 | search overlay, empty and with results | click `button[aria-label="Search"]`, scan `[role="dialog"]`; type the first product's first word, wait for results, scan again | input, placeholder, ≥ 1 result row |
| S12 | mobile nav drawer | 390×844, click `[data-testid="nav-menu-button"]`, scan `[data-testid="nav-menu-popup"]` | the three items Store / Account / Cart, the close button |
| S13 | login | `/en/account` unauthenticated | `[data-testid="login-page"]`, email/password inputs and their **placeholders**, `sign-in-button` |
| S14 | register | S13 + click `[data-testid="register-button"]` | `[data-testid="register-page"]`, five inputs |
| S15 | login error | S13 + submit empty → `[data-testid="login-error-message"]` | the error text |
| S16 | reset password | `/en/reset-password` | `h2`, input |
| S17 | account dashboard | authenticated `/en/account` | `[data-testid="overview-page-wrapper"]`, `[data-testid="account-nav"]` (desktop) / `[data-testid="mobile-account-nav"]` (mobile) |
| S18 | account orders | `/en/account/orders` with the fixture order | `[data-testid="order-details-link"]` |
| S19 | account order details | click S18's link | items table, totals |
| S20 | account addresses | `/en/account/addresses` | add-address card; then open `[data-testid="edit-address-modal"]` and scan it |
| S21 | account profile | `/en/account/profile` | the four editable rows; open one editor (`profile-name`) and scan its inputs |
| S22 | checkout, landed | authenticated, cart with items, `/en/checkout` | `[data-testid="sign-in-button"]` absent, `checkout-contacts-row`, `checkout-address-row`, `cart-total`, `submit-order-button` |
| S23 | checkout sheets | S22 + open `checkout-contacts-row` → scan `[role="dialog"]`; close; open `checkout-address-row` → scan | the sheet's inputs and its submit button |
| S24 | checkout, delivery and payment chosen | S22 + fixture-completed address, click `delivery-option-radio`, `submit-delivery-option-button`, `submit-payment-button` | `payment-method-summary`, `submit-order-button` enabled |
| S25 | order confirmed | `/en/order/<fixture order id>/confirmed` | order number, items, totals |
| S26 | 404 | `/en/this-does-not-exist` | the not-found heading and its link |
| S27 | loading states | the four `loading.tsx` routes (`/cart`, `/account`, `/account/@dashboard`, `/order/[id]/confirmed`) with `page.route("**/store/**", r => setTimeout(() => r.continue(), 3000))`; scan at t = 1 s | ≥ 1 skeleton block (an element ≥ 40×12 px with its own background and no text) |
| S28 | content pages | `/en/contact`, `/en/customer-service`, `/en/shipping` | `h1` |

Hover and focus are **states of S03/S04/S13/S22**, not surfaces of their own — see rules R8/R9.

### 2.4 What is measured on a surface

The walker (§1.1 is its prototype) visits every element in the surface's root, skips the invisible (`display:none`, `visibility:hidden`, `opacity:0`, boxes ≤ 1 px, `<svg>` children, `<nextjs-portal>`), and collects:

1. **Text elements** — every element owning a non-blank text node, plus `input`/`textarea`/`select` (value and `::placeholder`). Records computed `color`, the **effective background** (walk up the ancestors compositing every non-transparent `background-color` until an opaque one; `html`'s computed background is the canvas; a `background-image` ends the walk as `gradient/image`), font size and weight.
2. **Painted surfaces** — every element with its own `background-color` of alpha > 0, with its area.
3. **Borders** — every visible border side's colour.
4. **Focus** — 40 `Tab` presses; for each `document.activeElement`: `outline-*`, `box-shadow`, `:focus-visible`.
5. **Hover** — for the first product card: `border-color`, `box-shadow`, `transform`, title `text-decoration-line` before and after `hover()`.

Colours are compared after conversion to 8-bit sRGB with a tolerance of **±1 per channel** — Chromium returns `color(srgb …)` for `color-mix()` results and the rounding differs from the hex.

### 2.5 The expected set, derived from `theme.json`

For the active mode `m`:

- `PALETTE[m]` = every `#rrggbb` value in `modes[m].tokens` → the 19 colour tokens (`--radius` and the three shadow strings are excluded).
- `TEXT[m]` = `foreground, card-foreground, popover-foreground, primary-foreground, secondary-foreground, muted-foreground, accent-foreground, destructive-foreground, link, success, warning, destructive`.
- `SURFACE[m]` = `background, card, popover, primary, secondary, muted, accent, destructive`.
- `LINE[m]` = `border, input, ring, primary, destructive`.
- `BRIDGE[m]` = the computed value on `<html>` of every bridge variable whose `token-map.json` row is `mapped` or `diverged` (85 rows). These are derived from the palette by `color-mix` and are legitimate; `--fg-muted` (`muted-foreground` at 63.5 % over `background`) is the commonest example. Read live with `getComputedStyle(html).getPropertyValue(name)` — never recomputed from the JSON, so a broken bridge row fails here too.
- `OPEN[m]` = the computed value of the 28 `open` rows (`--bg-overlay`, `--borders-focus`, `--buttons-*-focus`, `--contrast-*`, …). These keep Medusa's own colours under every preset; a colour from this set on screen is a **WARN** (rule R11), because it is a canon gap, not a component bug.
- `ALLOWED-TEXT[m]` = `TEXT[m] ∪ BRIDGE-ink[m]`; `ALLOWED-BG[m]` = `SURFACE[m] ∪ BRIDGE-surface[m]` (bridge rows are split ink/surface by their Medusa name: `fg-*`/`*-text` vs `bg-*`/`button-*`/`tag-*-bg`).
- `PAIRS[m]` = the 16 pairs of style board §3.2 per mode, **but read from computed `--token` values on `<html>`**, not from the document.

`theme.json` may declare `allowLiterals: []` (per mode, hex values) for deliberate off-token paint — the image scrim of a hero, for instance. The gate prints the allow-list it used; an empty one is the default.

### 2.6 Rules — each one a failure with a name

| Rule | Assertion | Severity | Catches |
|---|---|---|---|
| R1 `mode-applied` | `html[data-theme] === presetId && html[data-mode] === m` before the scan | FAIL | the pilot's own trap in S6a §6.2 (profile dropped the theme block → medusa/light rendered) |
| R2 `root-painted` | `getComputedStyle(body).backgroundColor ∈ {background}` and `.color ∈ {foreground}` | FAIL | root cause A on every page at once |
| R3 `text-in-palette` | each text element's `color ∈ ALLOWED-TEXT[m]` | FAIL | `text-neutral-50`, `text-gray-*`, inherited UA black |
| R4 `bg-in-palette` | each text element's effective background `∈ ALLOWED-BG[m] ∪ allowLiterals`; `gradient/image` allowed only inside an element carrying `data-theme-scrim` | FAIL | `bg-white` header/footer/checkout column, `bg-neutral-900` promo strip, the side-menu gradient |
| R5 `contrast` | `ratio(color, effectiveBg) ≥ 4.5`, or `≥ 3.0` when font ≥ 24 px or ≥ 18.66 px bold | FAIL | black-on-ink headings, `#ededed` on white footer, `#a1a1a1` on white header |
| R6 `surface-in-palette` | each painted surface `∈ ALLOWED-BG[m] ∪ allowLiterals`, `img` excluded | FAIL | skeleton `bg-gray-100/200`, the `bg-black` count badge, white panels with no text in them |
| R7 `border-in-palette` | each visible border colour `∈ LINE[m] ∪ BRIDGE-line[m]` | FAIL | `border-gray-200`, the white PDP hairline (d-06) |
| R8 `focus-ring` | every Tab stop with `:focus-visible` shows `ring` (in `outline-color` or in a `box-shadow` layer) **and** no colour outside `PALETTE[m]` in either | FAIL | UA blue, `--borders-focus` Medusa blue, `focus:border-gray-700` |
| R9 `hover-contract` | card hover changes only `border-color` (to `ring`) and title `text-decoration`; `box-shadow`, `transform`, image `src` unchanged | FAIL | drift from style board §7/§8.1 (`hover: none`) |
| R10 `anchor-present` | every anchor of the surface is visible | FAIL | scanning an empty or redirected page and calling it clean |
| R11 `open-row-leak` | a computed colour equal to an `OPEN[m]` value is painted | WARN | the scrim `rgba(24,24,27,.72)`, Medusa focus stacks — until the canon adds the tokens s1b named |
| R12 `declared-pairs` | for each of `PAIRS[m]`: ratio from computed tokens ≥ floor, and equals the style-board number ± 0.01 | FAIL | a theme.json edit that silently breaks the board's claim; the board's own arithmetic |
| R13 `unparsed-colour` | any computed colour the scanner cannot parse (`lab()`, `oklch()`) | FAIL | a future CSS that the gate would otherwise pass by silence |
| R14 `role-anchor` | named roles carry the named token: hero CTA and add-to-cart background `= primary`, label `= primary-foreground`; promo strip background `= secondary`; card panel `= card`; dropdown/dialog panel `= popover`; error text `= destructive`; success text `= success`; every text placeholder `≥ 4.5` on its field; selected option border `= ring`; page radius on buttons/inputs/cards `= --radius` | FAIL | a palette-valid pair on the wrong role — the white hero pill (§1.7), the white light-mode add-to-cart label, the grey error toast, `rounded-lg`/`rounded-[8px]` on a 4 px preset |
| R15 `brand-string` | the wordmark, `<title>` suffix and footer copyright carry `profile.brand.name`; the strings `Upready Store`, `Medusa`, `Powered by` do not appear in rendered text | FAIL | the fallback wordmark on every page (§0) |

R2 + R3 + R5 together are the cheap smoke: if R2 fails, R3/R5 will fail on every inherited element, and the report says so once (`root cause: R2`) instead of 200 times.

### 2.7 Output

One JSON per run, `artifacts/registries/theme-coverage/<preset>-<yyyy-mm-dd>.json` (`upready.theme-coverage/v0`), plus the console table. Per finding:

```json
{ "rule": "R5", "surface": "S08", "route": "/en/cart", "mode": "dark", "viewport": "390x844",
  "element": "h1.font-sans.font-medium.h1-core", "text": "Cart", "fontSize": "32px",
  "color": "rgb(0, 0, 0)", "colorToken": null, "nearestToken": {"name": "--foreground", "distance": 237},
  "background": "rgb(10, 10, 10)", "backgroundToken": "--background", "backgroundFrom": "html",
  "ratio": 1.06, "floor": 3.0 }
```

Console, one line per surface then a total:

```
S08 cart-empty      dark  390x844  text 20  FAIL 14 (R5×12 R3×2)  surfaces 2/2 off-palette (R6)  borders 0  focus —
…
104 scans · 3 412 text elements · 618 failures in 27 distinct (colour, background) pairs · 41 WARN (R11) · exit 1
```

Findings are **grouped by distinct pair** in the console, because one Tailwind class produces one pair on forty pages; the JSON keeps every occurrence.

### 2.8 What stays and what goes

- T0h.5 stays as a regression proof **for the `medusa` preset only** (its purpose: the bridge does not move the vendor look). It is not a gate for a profile.
- The coverage gate runs on every preset that a profile names, in the profile's own catalog, as a **blocking** stage before the visual acceptance in §3 — a human should never be the first to see a black heading on a black page.
- A lint (`scripts/lint-literal-colours.mjs`) that fails on `bg-|text-|border-(white|black|gray|neutral|zinc|slate)-?\d*` outside an allow-list is the cheap pre-check; it catches root cause B at commit time, but it does not replace the gate (it cannot see inheritance, `color-mix`, or the UA default).

## 3. Human visual acceptance — the check the programme assigned and nobody ran

**Owner:** the creative director of the wave (named in the brief, not "the orchestrator"). **When:** after `theme:coverage` exits 0 and before the profile is marked shipped; a profile with an open "does not meet" in groups A–E is not shipped. **Where:** the live stand the acceptance names (rule 18f), in both modes and both viewports; the contact sheet `artifacts/media/<profile>/contact-sheets/*.webp` open beside it. **How to answer:** every line is `meets` / `does not meet`, with a screenshot file name for a "does not meet"; "mostly", "fine", "looks good" are not answers. Nothing here is decidable by a computed colour — that is the point.

### A. One brand

| # | Criterion | meets / does not meet |
|---|---|---|
| A1 | Cover the wordmark: the page is still recognisably *this* store and no other preset. The acid appears on the page **only** as CTA block, focus/hover ring, link, "in stock" and the shoe's own detail — nowhere as a fill behind body text or as a hover on menu rows (style board §3, decision 1). | |
| A2 | Count the chromatic colours on the home page in dark mode: exactly one (Sulphur) plus the photographs. A second hue anywhere in the UI (a blue focus ring, a red badge that is not `--destructive`) fails the line. | |
| A3 | Every corner radius on screen is the same family (4 px base): buttons, inputs, cards, dialogs, the promo strip. A pill or an 8 px card among 4 px cards fails. | |
| A4 | Type: headings and body use the profile's two families and nothing else; no page falls back to the system font (compare a heading on `/en` with one on `/en/account`). | |
| A5 | The header, footer, cart drawer, mobile drawer, search dialog and checkout sheets are the **same ink** as the page they sit on — no white slab, no lighter grey box, no gradient — in both modes. | |
| A6 | Light mode reads as the same brand with the polarity flipped: ink CTA with an acid label, darker acid for links; not "the dark theme inverted". | |

### B. Product frames — the grid reads as one catalog

| # | Criterion | meets / does not meet |
|---|---|---|
| B1 | On `/en/store` at 1280, all packshots share one background grey; put any two side by side and the seam between the grey of one and the grey of the other is invisible. A frame that is warmer, cooler, darker or vignetted fails. | |
| B2 | All shoes sit at the same scale — toe-to-heel width between 78 % and 84 % of the frame, the same clear space below the outsole. A shoe that fills the frame, or floats high, fails. | |
| B3 | All shoes face the same way: three-quarter front, toe to the **left**, outer side to camera. A mirrored frame (toe to the right) fails — `gutter-low-hero.webp` is flagged for exactly this and must be resolved, not shipped. | |
| B4 | Every packshot has one soft contact shadow directly beneath, and nothing else: no cast side shadow, no reflection, no floating shoe. | |
| B5 | Light and shadow direction agree across the grid (key from camera-left, fill from the right). One frame lit from the other side fails. | |
| B6 | One right shoe per frame; no pairs, no props, no hands, no box, no text, no logo-like marks on the shoe. Check every card, not a sample — there are 14. | |
| B7 | The shoe in each frame is the shoe the card names (colourway and category). Read the title, then the frame; `care-kit-hero.webp` is flagged for subject count and must be resolved. | |
| B8 | In dark mode the Tar-black colourways are separable from the `--card` surface — the outline of a black shoe on the grey sweep is readable at arm's length. | |

### C. A shop, not a template with new colours

| # | Criterion | meets / does not meet |
|---|---|---|
| C1 | The hero is a photograph with type sitting over its quiet third; the headline, subheadline and CTA are legible without a scrim doing all the work, and the scrim (if any) is ink, not a Tailwind gradient. | |
| C2 | The four category tiles read as one evening on one street — same light, same grade — and each tile's crop shows the shoe category it names. `tile-low-tops.webp` is flagged for the crop rule and must be resolved. | |
| C3 | The promo strip carries a service fact in tabular numbers with middots, on `--secondary`; it does not look like a discount banner and it does not look like a browser notification bar. | |
| C4 | The product grid has a rhythm: equal gutters, equal card heights, price and title aligned across a row, no card visibly taller because of a longer title. | |
| C5 | The hero CTA and the add-to-cart button are **blocks**, not outlines or links; disabled add-to-cart says why ("Pick a size"), it is not a grey mute. | |
| C6 | The PDP shows `Colourway · <name>` next to the swatches, sizes are a tappable row, out-of-stock sizes are still readable and say so. | |
| C7 | Empty states (empty cart, no orders, no addresses) are written in the brand's voice and sit on the page's ink — not a white card with vendor copy. | |
| C8 | Nothing on any screen reads as "starter template": no "Upready Store" fallback wordmark, no "Medusa" strings, no lorem, no default placeholder photo. | |

### D. Continuity through the journey

| # | Criterion | meets / does not meet |
|---|---|---|
| D1 | Walk home → category → PDP → add → cart → checkout → order confirmed → account/orders, in dark mode at 1280. No screen changes brand (the checkout column, the confirmation page and the account area are the same store). | |
| D2 | Repeat D1 at 390×844: the sticky PDP bar, the mobile drawer, the mobile account nav and the checkout sheets are on-brand and readable with a thumb. | |
| D3 | Repeat D1 in light mode: nothing that was correct in dark mode has become invisible (light text on white, white hairline on white). | |

### E. States

| # | Criterion | meets / does not meet |
|---|---|---|
| E1 | Hover a product card: only its edge turns Sulphur and the title underlines; nothing lifts, zooms, shadows or swaps. | |
| E2 | Tab through the PDP with a keyboard: every stop shows a 2 px Sulphur ring outside the element; never a blue ring, never nothing. Hover and focus look different from each other. | |
| E3 | Open the size and colourway selectors: the open list is a `--popover` panel with readable rows and a themed selected row. | |
| E4 | Submit an empty login form and a wrong password: the error is `--destructive` text on the page ink, readable. | |
| E5 | Add-to-cart in flight: the loading state is visible (spinner or label) on the button's own colour, not a near-invisible grey. | |
| E6 | Skeletons (reload `/en/cart` and `/en/account` on a throttled connection): the placeholders are `--muted`-coloured blocks on the ink page, not light-grey bars. | |

### F. Copy against picture

| # | Criterion | meets / does not meet |
|---|---|---|
| F1 | For each of the 14 products, read the description and look at the frame: the materials, the colourway and the acid detail the copy names are the ones in the picture. | |
| F2 | The four flagged renders (`gutter-low-hero`, `cattle-grid-trail-hero`, `care-kit-hero`, `tile-low-tops`) are either replaced by the second pass or explicitly accepted by name here; a flagged frame is not shipped by omission. | |

**Verdict line at the bottom of the filled sheet:** `ship` only when every line in A–E is `meets` and F lists the four flagged frames by decision. The filled sheet is saved as `artifacts/docs/<date>-<profile>-visual-acceptance.md` with the screenshots beside it, and its path goes into the profile's HANDOFF entry.

## Appendix A — per-surface totals, all 81 scans

Columns: text elements measured · below the contrast floor · in-contrast but off-palette · painted surfaces off-palette (with the colours) · body computed background / colour. `html data-mode` is the mode actually rendered. The four mobile search-overlay scans were added in a second run (`summary-mobile-search.json`).

| surface | mode | viewport | html data-mode | text elements | contrast FAIL | off-palette text | off-palette surfaces | body bg / color |
|---|---|---|---|---:|---:|---:|---|---|
| account-addresses | dark | desktop | dark | 29 | 18 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-addresses | dark | mobile | dark | 22 | 16 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-addresses | light | desktop | light | 29 | 2 | 5 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| account-addresses | light | mobile | light | 22 | 1 | 4 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| account-dashboard | dark | desktop | dark | 37 | 20 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-dashboard | dark | mobile | dark | 33 | 21 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-dashboard | light | desktop | light | 37 | 2 | 7 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| account-dashboard | light | mobile | light | 33 | 1 | 9 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| account-login | dark | desktop | dark | 34 | 19 | 7 | 2/4 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-login | dark | mobile | dark | 32 | 18 | 6 | 2/5 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-login | light | desktop | light | 34 | 6 | 6 | 1/4 (rgb(23, 23, 23)) | transparent / black |
| account-login | light | mobile | light | 32 | 5 | 6 | 1/4 (rgb(23, 23, 23)) | transparent / black |
| account-orders | dark | desktop | dark | 37 | 21 | 5 | 2/4 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-orders | dark | mobile | dark | 30 | 19 | 4 | 2/5 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| account-orders | light | desktop | dark | 37 | 21 | 14 | 1/4 (rgb(23, 23, 23)) | transparent / black |
| account-orders | light | mobile | light | 30 | 2 | 5 | 1/4 (rgb(23, 23, 23)) | transparent / black |
| account-profile | dark | desktop | dark | 102 | 36 | 38 | 4/7 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(47, 47, 47), rgb(13, 13, 13)) | transparent / black |
| account-profile | dark | mobile | dark | 95 | 34 | 37 | 4/8 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(47, 47, 47), rgb(13, 13, 13)) | transparent / black |
| account-profile | light | desktop | light | 102 | 26 | 26 | 2/6 (rgb(23, 23, 23), rgb(244, 244, 244)) | transparent / black |
| account-profile | light | mobile | light | 95 | 25 | 25 | 2/6 (rgb(23, 23, 23), rgb(244, 244, 244)) | transparent / black |
| account-register-form | dark | desktop | dark | 47 | 22 | 12 | 2/5 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| cart-dropdown-empty | dark | desktop | dark | 4 | 2 | 1 | 2/3 (rgb(255, 255, 255), rgb(17, 24, 39)) | transparent / black |
| cart-dropdown-empty | light | desktop | light | 4 | 0 | 1 | 1/3 (rgb(17, 24, 39)) | transparent / black |
| cart-dropdown-items | dark | desktop | dark | 12 | 7 | 4 | 3/4 (rgb(0, 0, 0), rgb(255, 255, 255), rgb(41, 41, 41)) | transparent / black |
| cart-dropdown-items | light | desktop | light | 12 | 0 | 1 | 1/4 (rgb(0, 0, 0)) | transparent / black |
| cart-empty | dark | desktop | dark | 20 | 16 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| cart-empty | dark | mobile | dark | 18 | 15 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| cart-empty | light | desktop | light | 20 | 2 | 3 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| cart-empty | light | mobile | light | 18 | 1 | 3 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| cart-items | dark | desktop | dark | 35 | 15 | 7 | 4/5 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(0, 0, 0), rgb(41, 41, 41)) | transparent / black |
| cart-items | dark | mobile | dark | 33 | 14 | 6 | 4/6 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(41, 41, 41), rgb(0, 0, 0)) | transparent / black |
| cart-items | light | desktop | light | 35 | 2 | 3 | 2/5 (rgb(23, 23, 23), rgb(0, 0, 0)) | transparent / black |
| cart-items | light | mobile | light | 33 | 1 | 3 | 2/5 (rgb(23, 23, 23), rgb(0, 0, 0)) | transparent / black |
| category | dark | desktop | dark | 56 | 20 | 26 | 5/8 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(31, 42, 46), rgb(138, 138, 138), rgb(74, 20, 24)) | transparent / black |
| category | dark | mobile | dark | 26 | 17 | 2 | 2/4 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| category | light | desktop | light | 56 | 5 | 4 | 3/8 (rgb(23, 23, 23), rgb(31, 42, 46), rgb(74, 20, 24)) | transparent / black |
| category | light | mobile | light | 26 | 4 | 2 | 1/3 (rgb(23, 23, 23)) | transparent / black |
| checkout | dark | desktop | dark | 43 | 20 | 6 | 2/4 (rgb(41, 41, 41), rgb(245, 245, 245)) | transparent / black |
| checkout | dark | mobile | dark | 40 | 19 | 6 | 2/4 (rgb(41, 41, 41), rgb(245, 245, 245)) | transparent / black |
| checkout | light | desktop | light | 43 | 5 | 5 | 0/3 () | transparent / black |
| checkout | light | mobile | light | 40 | 4 | 5 | 0/3 () | transparent / black |
| checkout-address-sheet | dark | desktop | dark | 10 | 2 | 3 | 0/4 () | transparent / black |
| checkout-address-sheet | light | desktop | light | 10 | 2 | 2 | 0/4 () | transparent / black |
| checkout-contacts-sheet | dark | desktop | dark | 19 | 4 | 8 | 0/4 () | transparent / black |
| checkout-contacts-sheet | light | desktop | light | 19 | 7 | 4 | 0/4 () | transparent / black |
| contact | dark | desktop | dark | 20 | 14 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| contact | dark | mobile | dark | 18 | 13 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| contact | light | desktop | light | 20 | 2 | 1 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| contact | light | mobile | light | 18 | 1 | 1 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| home | dark | desktop | dark | 101 | 16 | 62 | 6/9 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(232, 228, 220), rgb(138, 138, 138), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| home | dark | mobile | dark | 43 | 15 | 5 | 2/4 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| home | light | desktop | light | 101 | 4 | 3 | 4/9 (rgb(23, 23, 23), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| home | light | mobile | light | 43 | 3 | 3 | 1/3 (rgb(23, 23, 23)) | transparent / black |
| mobile-nav-drawer | dark | mobile | dark | 5 | 0 | 5 | 0/1 () | transparent / black |
| mobile-nav-drawer | light | mobile | light | 5 | 0 | 5 | 0/1 () | transparent / black |
| order-confirmed-unknown | dark | desktop | dark | 20 | 14 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| order-confirmed-unknown | dark | mobile | dark | 18 | 13 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| order-confirmed-unknown | light | desktop | light | 20 | 2 | 1 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| order-confirmed-unknown | light | mobile | light | 18 | 1 | 1 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| pdp | dark | desktop | dark | 88 | 18 | 39 | 6/10 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(138, 138, 138), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| pdp | dark | mobile | dark | 50 | 17 | 2 | 3/7 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(138, 138, 138)) | transparent / black |
| pdp | light | desktop | light | 88 | 6 | 1 | 4/10 (rgb(23, 23, 23), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| pdp | light | mobile | light | 50 | 5 | 1 | 1/7 (rgb(23, 23, 23)) | transparent / black |
| pdp-options-selected | dark | desktop | dark | 87 | 17 | 39 | 6/9 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(138, 138, 138), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| pdp-options-selected | light | desktop | light | 87 | 5 | 2 | 5/10 (rgb(23, 23, 23), rgb(239, 239, 239), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| reset-password | dark | desktop | dark | 20 | 16 | 3 | 2/2 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| reset-password | dark | mobile | dark | 18 | 15 | 2 | 2/3 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| reset-password | light | desktop | light | 20 | 2 | 3 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| reset-password | light | mobile | light | 18 | 1 | 3 | 1/2 (rgb(23, 23, 23)) | transparent / black |
| search-overlay-empty | dark | desktop | dark | 19 | 2 | 0 | 1/3 (rgb(41, 41, 41)) | transparent / black |
| search-overlay-empty | dark | mobile | dark | 19 | 2 | 0 | 1/3 (rgb(41, 41, 41)) | transparent / black |
| search-overlay-empty | light | desktop | light | 19 | 1 | 1 | 0/3 () | transparent / black |
| search-overlay-empty | light | mobile | light | 19 | 1 | 1 | 0/3 () | transparent / black |
| search-overlay-results | dark | desktop | dark | 17 | 1 | 3 | 2/4 (rgb(41, 41, 41), rgb(39, 44, 17)) | transparent / black |
| search-overlay-results | dark | mobile | dark | 17 | 1 | 3 | 2/4 (rgb(41, 41, 41), rgb(39, 44, 17)) | transparent / black |
| search-overlay-results | light | desktop | light | 17 | 1 | 3 | 1/4 (rgb(243, 245, 238)) | transparent / black |
| search-overlay-results | light | mobile | light | 17 | 1 | 3 | 1/4 (rgb(243, 245, 238)) | transparent / black |
| store | dark | desktop | dark | 141 | 22 | 90 | 6/9 (rgb(23, 23, 23), rgb(255, 255, 255), rgb(138, 138, 138), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| store | dark | mobile | dark | 44 | 16 | 2 | 2/4 (rgb(23, 23, 23), rgb(255, 255, 255)) | transparent / black |
| store | light | desktop | light | 141 | 4 | 7 | 4/9 (rgb(23, 23, 23), rgb(232, 228, 220), rgb(74, 20, 24), rgb(31, 42, 46)) | transparent / black |
| store | light | mobile | light | 44 | 3 | 2 | 1/3 (rgb(23, 23, 23)) | transparent / black |

## Appendix B — what to rerun

From `apps/storefront` (package resolution), stand up on :8028/:9023:

```
node --input-type=module < <scratchpad>/probe.mjs            # 77 scans + focus + hover, ~5 min; writes probe/*.json, *.png, summary.json
ONLY=anon VPS=mobile SKIP_ROUTES=1 RUN_TAG=mobile-search node --input-type=module < <scratchpad>/probe.mjs
node --input-type=module < <scratchpad>/probe-dropdowns.mjs  # listing comboboxes open, bottom nav
node <scratchpad>/probe-tables.mjs                             # markdown tables from probe/*.json
```

The registration the probe performs writes one customer (`probe-<timestamp>@example.com`) to the stand database `upready_store_sneakers`; no order was created.
