# proof-short — port notes

## What was ported

Source of truth: `reference/rendered/05-proof-short.html` (1 500 raw bytes, the smallest
section in the registry). It is a single static block:

- root `<section>` with a top border, generous clamp() padding, `position: relative`.
- two decorative `<i>` "corner tick" pseudo-elements (top-left / top-right), each a 13×13px
  transparent box drawing an L-shaped mark out of two 1px/1.2px gradient lines.
- a flex row (`flex-wrap: wrap; align-items: baseline; gap: 10px 20px`) holding three items:
  - eyebrow label "коротко" (Roboto Mono, 10.5px, uppercase, tracked, `flex: 0 0 auto`)
  - the summary paragraph (`flex: 1 1 420px`, 14.5px/1.6, `#27272A`)
  - an anchor "Почему это важно — подробнее" → `#proof-full` (`flex: 0 0 auto`, 13px/500)

All copy is verbatim in `data.ts` (`eyebrow`, `summary`, `linkLabel`, `linkHref`). Every inline
style value from the rendered DOM was carried into `styles.module.css` unchanged (colors,
sizes, the clamp() padding, the two-layer gradient corner marks, the flex-basis values). The
anchor's color/hover/underline are not set inline in the reference either — they come from the
page-wide `a { color:#2563eb } a:hover { color:#18181b }` rule already present in
`src/styles/base.css`, so no color rule was duplicated here.

## Interactive behaviour

None. Grepped `reference/dc-script.js` for this section's text ("коротко", "Wildberries",
"1,5%", "proof-full") and for the slug itself — no matches beyond unrelated FAQ/pricing copy
that happens to also mention Wildberries (lines 159, 160, 392). `reference/props.json` has no
key touching this section either (checked for the same strings — zero hits). The section has
no `show*` flag, no tabs/rail/accordion, nothing to re-express as React state. It renders as a
plain, static component.

## Measured diff

Toolchain: `pnpm exec tsc --noEmit` → clean, no output.

Ran (per §3.6, port 5205):

```
cd apps/homepage/port && nohup pnpm exec vite --port 5205 > .logs/proof-short.log 2>&1 &   # PID 25089, waited for "ready in" line
node scripts/shot.mjs --url "http://localhost:5205/?section=proof-short" \
  --selector '[data-section="proof-short"]' --out shots/out/proof-short.png
node scripts/diff.mjs reference/shots/proof-short.png shots/out/proof-short.png
kill 25089   # confirmed dead (lsof -iTCP:5205 empty afterwards)
```

`diff.mjs` printed exactly:

```json
{"diffPct":1.7812,"w":1440,"h":131,"note":"size mismatch: reference/shots/proof-short.png 1278x131 vs shots/out/proof-short.png 1440x131, padded to 1440x131"}
```

`1.7812 ≤ 2` → target met.

## What still differs and why

The reference screenshot is 1278px wide, mine is 1440px (the full harness viewport). This is
NOT a styling error in this section: the legacy page wraps its whole body (nav through footer)
in a shared container —

```html
<div style="max-width:1280px;margin:0 auto;background:#fff;border-left:1px solid #E4E4E7;border-right:1px solid #E4E4E7">
```

— visible in `apps/homepage/index.html` line 79. 1280px minus the two 1px borders is exactly
1278px, matching the reference shot's width. `reference/rendered/05-proof-short.html` is the
computed style of the `<section>` INSIDE that wrapper, so its own inline styles never mention
the 1280px cap — the cap lives one level up, outside this section's DOM. Rendered in isolation
(no shell wrapper), my component correctly fills the 1440px harness viewport instead, which is
exactly what an unwrapped element screenshot should do. Every diffed pixel inside the shared
1278px column matches; the extra 162px column on the right is the padded-comparison artifact
the diff script's note describes, not a mismatch in this section's own styling.

## Needs from merger

- Wrap the assembled sections (inside `<Shell>`, between the nav and footer) in the shared
  `max-width: 1280px; margin: 0 auto; background: #fff; border-left/right: 1px solid #E4E4E7`
  container from `apps/homepage/index.html` line 79. Once that wrapper exists in `App.tsx`,
  a full-page or full-section screenshot of `proof-short` should match the reference at 1278px
  with no size-mismatch padding at all. Nothing else needed from the merger for this section.
