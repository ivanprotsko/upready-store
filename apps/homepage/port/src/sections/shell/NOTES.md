# shell — nav + footer («Подвал»)

## What was ported

Source of truth: `reference/rendered/00-shell.html` (the RENDERED DOM), cross-checked against
`reference/raw/00-shell.html` for the `sc-if`-gated links and `style-hover` values that the
rendered snapshot doesn't carry (it's a static, non-hovered snapshot).

- **`Nav`** (`<header data-section="shell-nav" data-testid="sec-shell-nav">`, wrapping a `<nav>`
  with the same inline styles as the rendered `<nav>` element): spacer, then the three
  conditionally-shown links (Состав / Цены / Вопросы), then the four always-on links (Оплата,
  Тарифы, Доставка, Примеры), then the Telegram "Связаться" button with its inline SVG icon.
  All copy/hrefs are in `data.ts`, verbatim.
- **`Footer`** (`<footer data-section="shell-footer" data-testid="sec-shell-footer">`): brand name,
  legal-requisites paragraph with a `todo:` badge, two policy links each with their own `todo:`
  badge, the Telegram contact button (larger variant, same icon), the cookie-notice paragraph with
  its `todo:` badge, and the doc-status stamp line. All copy verbatim in `data.ts`, all four
  `todo: …` badges preserved exactly (colors, border, monospace font, padding).
- **`Shell`** (default export): `<Nav /> {children} <Footer />`, per contract §3 item 2.

All inline style values (colors as `rgb()`, `px`/`clamp()` sizes, radii, the two-layer
`linear-gradient` corner marks on the footer) were copied verbatim from the rendered HTML into
`styles.module.css` — nothing recomputed or approximated.

## Interactive behaviour re-implemented

- **Conditional nav links** (`showIncluded` / `showPricing` / `showFaq`): in `reference/raw/00-shell.html`
  these three `<a>` tags are wrapped in `<sc-if value="{{ showIncluded }}"> …`, etc. In
  `dc-script.js` those three booleans are `showIncluded: b.included, showPricing: b.pricing,
  showFaq: b.faq` (line ~340), where `b = this.state.blocks`, initialised to
  `{ proof:false, frame:false, included:false, pricing:false, faq:false }` (line 2) — a **page-wide
  admin toggle** (flipped from an admin panel unlocked by a long-press on the logo — see "Needs
  from merger"), not state private to the nav. Reproduced as optional `Nav` props
  (`showIncluded?`, `showPricing?`, `showFaq?`), each defaulting to `false` — the same default the
  live state carries, which is exactly why none of the three links appear in
  `reference/rendered/00-shell.html`. `Shell`'s default render (and the `?section=shell` harness)
  therefore matches the rendered reference with zero props passed.
- **Footer visibility / everything else**: no `sc-if` gates it and no reference to `"footer"`
  appears anywhere in `dc-script.js` — its `display:none` is a static, unconditional value on the
  rendered `<footer>` (per the brief's own registry note: "footer is `display:none` by default").
  Ported as a plain static style; there is no toggle to wire up.
- **`:hover` states**: added as `:hover` CSS rules using the `style-hover="…"` values from
  `reference/raw/00-shell.html` (nav links, the two Telegram buttons, the footer policy links).
  These don't affect the static acceptance screenshot but keep the port faithful to the legacy
  page's interaction design.

Not reproduced (out of this folder's scope — see "Needs from merger" below): `logoClick`,
`startPress`/`endPress` (long-press → admin password prompt), and the sticky header bar + logo
that wrap the `<nav>` on the real page. None of these touch `<nav>` or `<footer>` themselves and
none are captured by `reference/raw|rendered/00-shell.html` (see `scripts/split-reference.mjs`:
"00-shell.html = the `<nav>` plus the `<footer>`" — the sticky wrapper `<div>` and the `<a>` logo
around it are a plain `<div>`, not matched by that extraction, and are absent from both raw and
rendered references for this section).

## Measured diff

```
$ pnpm exec tsc --noEmit
(no output — clean)

$ node scripts/shot.mjs --url "http://localhost:5200/?section=shell" --selector '[data-section="shell-nav"]' --out shots/out/shell.png
{"ok":true,"url":"http://localhost:5200/?section=shell","selector":"[data-section=\"shell-nav\"]","out":"shots/out/shell.png"}

$ node scripts/diff.mjs reference/shots/shell.png shots/out/shell.png
{"diffPct":3.777,"w":1440,"h":36,"note":"size mismatch: reference/shots/shell.png 1088x36 vs shots/out/shell.png 1440x36, padded to 1440x36"}
```

vite: `nohup pnpm exec vite --port 5200 > .logs/shell.log 2>&1 &` → PID 56567, ready in 118 ms;
killed after measuring (confirmed dead via `ps -p 56567`).

## What still differs, and why

**Size/position only, not styling.** Side-by-side, the link text, spacing, font, colors and the
"Связаться" button all render identically to the reference crop — the entire 3.777% comes from
element *width*: the reference `shell.png` is **1088×36 px**, mine is **1440×36 px**.

Root cause, confirmed by reading `scripts/capture-reference.mjs` (lines ~157–178): the reference
screenshot is `navHandle.screenshot()` taken on the **full legacy page** at a 1440 px viewport,
where `<nav>` sits inside `<div style="position:sticky;…"><div style="max-width:1280px;…"><a>Upready
logo</a><nav style="flex:1 1 auto;…">…</nav></div></div>`. The logo (`flex:0 0 auto`) and the
1280 px/56 px-padded container consume ~352 px, leaving the real `<nav>` only 1088 px wide before
its own `flex:1 1 auto` fills the remainder. That sticky bar + logo `<div>` is **not part of the
`shell` section's extracted boundary** (confirmed in `split-reference.mjs`: "00-shell.html = the
`<nav>` plus the `<footer>`" — a plain `<div>`, not a `<nav>`/`<footer>` tag, so the splitter's
tag-balancing walker never captures it), so it appears in neither `reference/raw/00-shell.html`
nor `reference/rendered/00-shell.html`, and isn't part of any of the 16 registered sections either.

In this component's own isolated harness (`?section=shell` → bare `<Shell/>`, no parent flex row),
`<nav>`'s `flex: 1 1 auto` has nothing to shrink against and fills the full 1440 px viewport
instead of the 1088 px it gets on the real page — which is exactly the gap the diff measures.

I deliberately did **not** hardcode `.nav` to a fixed 1088 px width to force the number down: that
would be correct only in this isolated preview and **wrong** once merged, where `<nav>` must keep
`flex: 1 1 auto` so it fills whatever space remains next to the real logo (whose measured width
varies with font rendering) inside the max-width:1280 container — a fixed width would either clip
or double-constrain it there. The CSS in `styles.module.css` matches the legacy `<nav>`'s inline
styles verbatim; the discrepancy is a property of the harness measuring this section in isolation,
not of the port.

## Needs from merger

1. **Sticky header bar + logo**, wrapping `Nav`: `<div style="position:sticky;top:0;z-index:40;
   height:60px;background:rgba(250,250,250,.85);backdrop-filter:blur(14px);border-bottom:1px solid
   #E4E4E7"><div style="max-width:1280px;margin:0 auto;height:100%;background:rgba(255,255,255,.5);
   border-left:1px solid #E4E4E7;border-right:1px solid #E4E4E7;padding:0 clamp(20px,4vw,56px);
   display:flex;align-items:center;justify-content:space-between;gap:16px"><a href="/" …><span
   style="font-size:15.5px;font-weight:600;letter-spacing:-.02em">Upready</span></a>{Nav}</div></div>`
   (read from `apps/homepage/index.html` around the `<nav>`, lines ~57–63). Not part of any
   registered section (§2 of the brief has no entry for it) and not captured by
   `split-reference.mjs`'s extraction — someone owns it, and it isn't this folder.
2. **Logo behaviour**, from `dc-script.js`: `onClick={logoClick}` (`(e) => e.preventDefault()`,
   line 367), `onMouseDown/onTouchStart={startPress}`, `onMouseUp/onMouseLeave/onTouchEnd={endPress}`
   (lines 5–9) — a 600 ms long-press opens an admin password prompt (`pwOpen`), unrelated to `Nav`
   or `Footer` and not touching either element's own markup.
3. **`showIncluded`/`showPricing`/`showFaq`** are page-wide `state.blocks.{included,pricing,faq}`
   (admin-toggled, default `false`) shared with the `included`, `pricing` and `faq` sections
   (`order.forEach(([k, on]) => …)`, `dc-script.js` line ~319). Per the merger contract, restore
   this as one piece of state in `App.tsx` and pass the three booleans down as `Nav` props; without
   them `Nav` renders its (correct, reference-matching) all-`false` default.
4. **Re-measure `diffPct` once merged**: with the real sticky bar + logo in place, `<nav>`'s
   `flex: 1 1 auto` should size to ~1088 px exactly as on the reference page, which should resolve
   the 3.777% gap reported above — worth a quick re-check with `scripts/diff.mjs` on the merged
   page rather than assuming.
