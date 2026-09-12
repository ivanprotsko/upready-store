# showcase (NN=12) — port notes

## What was ported

Source: `reference/rendered/12-showcase.html` (rendered DOM), cross-checked against
`reference/raw/12-showcase.html` (template) and `reference/dc-script.js` for behaviour and
copy origin.

- Root `<section data-section="showcase" data-testid="sec-showcase" id="sec-showcase">`, all
  inline styles ported 1:1 into `styles.module.css` classes (colors, sizes, radii, fonts,
  spacing — same hex/px/clamp values as the rendered DOM).
- Header block: eyebrow dot + counter/label row, `<h2>` heading, `<p>` description — all text
  copied verbatim into `data.ts` (`heading`, `description`, `eyebrowLabel`).
- Nav row: prev/back and next/forward icon buttons (same SVG paths, prev rotated 180deg).
- Card rail (`id="rail-cards"`): 5 cards from `this.showcase` (`dc-script.js:147-154`), mapped
  through `renderVals()` (`dc-script.js:264-265`) into `{eyebrow, title, desc, img, alt, url}` —
  copied verbatim into `data.ts` `cards[]`. Images referenced as `/images/<file>.webp`; all 5
  files confirmed present under `port/public/images/`.
- Card link targets (`https://ferrite.upready.dev`, etc.) kept as real external `<a target="_blank"
  rel="noopener">` hrefs, verbatim from `dc-script.js`.

## Interactive behaviour re-implemented

- **Rail scroll (prev/next buttons)** — ported from `scrollRail(id, el, d)`
  (`dc-script.js:36-42`) and its two call sites `prevCard`/`nextCard` (`dc-script.js:421-422`).
  The legacy code only uses the sign of `d` (-291 / 291); the actual scroll distance is measured
  live from the rail's first child's `getBoundingClientRect().width + 1`. Re-implemented as a
  `useRef<HTMLDivElement>` on the rail plus a `scrollRail(direction: 1 | -1)` closure that reads
  `railRef.current.firstElementChild` at click time and calls `node.scrollBy({ left, behavior:
  "smooth" })` — same runtime measurement, same fallback (`340`) when the rail is empty.
  No other state: no visibility flags, no tabs/accordion apply to this section.
- `nShowcase` ("10", the eyebrow counter) is a **static value** in `data.ts`, not derived state —
  see "Needs from merger" below for why.

## tsc

`pnpm exec tsc --noEmit` (run from `apps/homepage/port`) — clean, no output.

## Measured diff

Harness: `cd apps/homepage/port && nohup pnpm exec vite --port 5212 > .logs/showcase.log 2>&1 &`
(PID 25940, confirmed ready via the "VITE v6.4.3 ready" log line).

```
node scripts/shot.mjs --url "http://localhost:5212/?section=showcase" --selector '[data-section="showcase"]' --out shots/out/showcase.png
{"ok":true,"url":"http://localhost:5212/?section=showcase","selector":"[data-section=\"showcase\"]","out":"shots/out/showcase.png"}

node scripts/diff.mjs reference/shots/showcase.png shots/out/showcase.png
{"diffPct":5.188,"w":1440,"h":967,"note":"size mismatch: reference/shots/showcase.png 1278x967 vs shots/out/showcase.png 1440x967, padded to 1440x967"}
```

**diffPct = 5.188** (target ≤ 2 — miss).

Vite process killed after measuring (`kill 25940`; confirmed gone via `ps -p 25940`, no rows).

## What still differs and why

Visually (both screenshots inspected side by side) the header text, heading, description,
eyebrow counter, and all 5 cards (images, eyebrow/title/desc text) render pixel-identical to the
reference wherever the two frames overlap. The measured gap comes from three causes, none of
which are fixable inside `sections/showcase/`:

1. **Reference frame is 1278px wide, mine is 1440px** — same artifact already documented in
   `sections/hero/NOTES.md`: the legacy page wraps all sections in a
   `<div style="max-width:1280px;margin:0 auto;...border-left:1px solid #E4E4E7;border-right:1px
   solid #E4E4E7">` (see `apps/homepage/index.html:79`), giving 1278px of interior width. That
   wrapper lives at the shell/App level, outside any one section's DOM, so `?section=showcase`
   (which renders the component standalone, per `src/main.tsx`) has nothing constraining it to
   1278px — it fills the full 1440px viewport used by `scripts/shot.mjs`.
2. **This section is more sensitive to that missing wrapper than most**, because unlike a
   centered heading, two elements react to the extra 162px directly: the nav-button row uses
   `justify-content: flex-end`, so my prev/next buttons sit ~162px further right than in the
   reference (inside the shared 0–1278 columns, the reference shows buttons and mine shows the
   card rail's white background there instead); and the card rail is `overflow-x: auto` with
   `flex-wrap: nowrap`, so at 1440px it fits noticeably more of the 5th card (Kerbstone/"Made for
   the kerb, not the catwalk") before needing a scroll than the 1278px reference does, where that
   card is cut off mid-image. Both are real pixel differences inside the compared region, not
   just the zero-padded extra column — that's why this diffPct (5.188) is well above hero's
   documented 1.5539 for the same width mismatch.
3. **The reference screenshot has a floating overlay baked in**: `reference/shots/showcase.png`
   shows a small panel of toggle switches and audience buttons (`warm` / `price`) over the
   lower-left of the frame — this is some page-wide debug/audience-switcher widget (visible in
   `dc-script.js`'s `audienceBtns`, flagged as unconsumed-in-hero in `sections/hero/NOTES.md`
   under "Needs from merger"), not part of the showcase section's own DOM. It was captured
   because it was on-screen and overlapping the section's bounding box at screenshot time; my
   render has nothing there because the showcase component alone was never going to render it.

None of these are section-local bugs — re-measuring against the *shared 1278-column region only*
would leave essentially the two items above (buttons shifted, extra card visible), both direct,
mechanical consequences of missing the shell's max-width wrapper.

## Needs from merger

- Wrap section content in the shell's `max-width:1280px; margin:0 auto; border-left/right:1px
  solid #E4E4E7` container so standalone (`?section=`) and assembled renders match the 1278px
  reference frame width. (Same ask as `sections/hero/NOTES.md`.)
- The floating audience/debug widget (`audienceBtns`, `dc-script.js` `renderVals()`) is
  page-global and unconsumed by any section's own rendered/raw HTML I've seen — if it belongs
  somewhere in the assembled page, that's a shell/App-level element, not showcase's. Recommend
  re-measuring `reference/shots/showcase.png` against a version of the assembled page with that
  widget dismissed/hidden, since it is not reproducible from a single section's markup.
- `nShowcase` ("10 · примеры") is `num.showcase`, a position computed at render time from which
  optional blocks (`b.proof`, `b.frame`, `b.included`, `b.pricing`, `b.faq`) are currently
  visible (`dc-script.js:319-322`). I hardcoded the rendered value ("10") per `reference/rendered/
  12-showcase.html`; if the merger restores the shared `show*` flags as page-level state (per the
  brief's §4 "Merger contract"), this counter should be recomputed from that shared state rather
  than staying a static string.
