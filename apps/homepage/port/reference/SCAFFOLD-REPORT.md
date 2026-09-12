# Scaffold report — homepage landing port

Session: session_01B7q8iXvHywuitV8sAFtbnx. Brief:
`artifacts/docs/2026-09-12-homepage-landing-port-brief.md`.

## What was built

`apps/homepage/port/` (Vite + React 19 + TS harness), exactly per brief §1:

- `package.json` (`@upready/homepage-port`, private, scripts `dev`/`build`/`preview`/`typecheck`),
  `vite.config.ts` (`@vitejs/plugin-react`), `tsconfig.json` (strict, `jsx: react-jsx`,
  `types: ["vite/client"]`), `index.html`, `.gitignore` (`.logs`, `shots/out`, `node_modules`, `dist`).
- `public/images` — relative symlink to `../../images` (`readlink` confirms `../../images`).
- `src/main.tsx` — `?section=<slug>` renders one registry entry in isolation; no param renders
  `<App/>`. `src/App.tsx` — first assembly: `Shell` around all 15 content sections in DOM order
  (merger-owned from here).
- `src/styles/base.css` — Google Fonts `@import`, minimal reset, the legacy `<style>` block
  verbatim (reference/style.css), body background/color.
- `src/sections/index.ts` — frozen registry, 16 entries (`shell` + the 15 of §2), DOM order,
  `{ slug, label, id?, Component }`.
- `src/sections/<slug>/` × 16 — stub folders: `index.tsx` (placeholder
  `<section data-section data-testid id?>`; `shell` exports named `Nav`/`Footer` plus default
  `Shell`), empty `styles.module.css`, `data.ts` (`export {};`), `NOTES.md` (`stub`).
- `scripts/split-reference.mjs`, `scripts/shot.mjs`, `scripts/diff.mjs` (all three required by
  the brief), plus `scripts/capture-reference.mjs` (one-off puppeteer capture of the rendered
  legacy page — not in the brief's file list, kept for reproducibility; see "Blockers /
  measured facts" below for why it exists and what it does).

## Install / typecheck / build

- `pnpm install --filter @upready/homepage-port` from the repo root — **exit 0**, "Done in
  1m 16.1s". Log: `apps/homepage/port/.logs/install.log`. Two pre-existing unrelated peer-dep
  warnings (backend `ajv-formats`, storefront `@medusajs/ui` vs React 19) — not from this
  package. `pnpm-lock.yaml` was updated by the install (expected: a new workspace package was
  added); nothing was committed.
- `pnpm exec tsc --noEmit` inside `port/` — **exit 0**, no output. Log: `.logs/tsc.log`.
- `pnpm exec vite build` — **exit 0**. Log: `.logs/build.log`:
  ```
  dist/index.html                   0.41 kB │ gzip:  0.28 kB
  dist/assets/index-B4IwT0IU.css    0.83 kB │ gzip:  0.49 kB
  dist/assets/index-DIXUptmn.js   190.30 kB │ gzip: 59.84 kB
  ✓ built in 506ms
  ```

## scripts/split-reference.mjs

Static HTML parser (no browser): reads `apps/homepage/index.html` (untouched), walks a
tag-balancer that respects void elements, self-closing tags and raw-text elements
(`<script>`/`<style>`), and writes `reference/props.json` (decoded `data-props` JSON,
pretty-printed), `reference/dc-script.js` (the data-dc-script element's JS text), `reference/style.css`
(the `<style>` block), and `reference/raw/<NN>-<slug>.html` for all 16 entries (`00-shell.html`
= the literal `<nav>` element + the literal `<footer>` element).

Verified against the brief's §2 "raw bytes" column: every one of the 15 section files lands
within 2 bytes of the stated size (my extraction includes the closing tag plus one trailing
newline; the brief's count appears to exclude a fixed 3 bytes per element — same constant
offset on all 15, unrelated to content). `00-shell.html`'s two parts (6897 bytes combined) are
within 5 bytes of the brief's "3045 + 3828".

## Puppeteer capture (scripts/capture-reference.mjs)

Reference server on port 4790 was already listening (`lsof` showed an existing `python3`
process) — reused as-is, nothing started or stopped by this session.

**Measured fact that changed the plan**: the brief's wait condition ("the `<x-dc>` template is
replaced and 15 `<section>` elements exist") does not hold at first render. Reading
`reference/dc-script.js`, five sections (`proof-full`, `proof-short`, `frame`, `included`,
`pricing`, `faq`) are gated behind `state.blocks.*` flags that all default to `false`
(`dc-script.js:2`, `:339-340`), and `proof-full`/`proof-short` are mutually exclusive on
`state.audience` (`'cold'` vs `'warm'`). Un-toggled, only 9 of 15 `<section>` elements ever
render — confirmed by `document.querySelectorAll('body section').length === 9` on first load. The
page ships an admin debug panel (gated by `sessionStorage.upready_admin`, password `'500p3r'`
in plaintext in the shipped client bundle at `dc-script.js:12` — not a secret broken here, just
already-public JS) with toggle switches for exactly these five blocks plus an audience switcher;
the footer itself says "10 открытых todo — страницу нельзя публиковать", i.e. this is a
work-in-progress draft page with optional sections hidden by design pending content.

To get every registry slug rendered at least once, the script sets
`sessionStorage.upready_admin = '1'` before navigation (same effect `submitPw()` has — no
password typed), opens the panel, and runs two passes: audience `cold` with all five blocks
toggled on (covers everything except `proof-short`), then audience `warm` with the `proof` block
on (covers `proof-short`). Sections are matched to slugs by `data-screen-label`/id (§2), not by
DOM position, since the two passes render different subsets.

Result: **all 16 slugs captured**, verified by listing the directories (not assumed):

```
reference/rendered/  00-shell.html .. 15-final-cta.html   (16 files)
reference/shots/      shell.png, hero.png, .. final-cta.png (16 files)
```

`referenceShotsCount = 16` (every slug has both `reference/shots/<slug>.png` and the matching
`reference/rendered/<NN>-<slug>.html`).

## Proving shot.mjs and diff.mjs

`vite build` above; then `nohup pnpm exec vite --port 5290 > .logs/scaffold.log 2>&1 &` (PID
85520, confirmed by the "ready in 118 ms" log line), then:

```
$ node scripts/shot.mjs --url "http://localhost:5290/?section=hero" --selector '[data-section="hero"]' --out shots/out/hero.png
{"ok":true,"url":"http://localhost:5290/?section=hero","selector":"[data-section=\"hero\"]","out":"shots/out/hero.png"}

$ node scripts/diff.mjs reference/shots/hero.png shots/out/hero.png
{"diffPct":5.4807,"w":1440,"h":466,"note":"size mismatch: reference/shots/hero.png 1278x466 vs shots/out/hero.png 1440x20, padded to 1440x466"}
```

Both scripts ran and printed JSON as required. The huge diff is expected — the hero stub is a
one-line placeholder (20px tall vs. the reference's 466px), not a port; fidelity is the section
agent's job, not the scaffold's. PID 85520 was killed afterward and confirmed stopped
(`ps -p 85520` → no such process).

## Blockers

None that block downstream work. Notes for section/merger agents:

- The five gated sections need their `show*` visibility logic (§3.4 of the brief: "re-express as
  React state") re-derived from `dc-script.js:330-340` — the toggle/admin-panel mechanism itself
  is an authoring tool for this draft page, not part of the shipped UX, and is **not** part of
  the port (the brief's registry has no `shell-admin` slug; nothing in §2 asks for it). Default
  visibility for each ported section should follow `reference/props.json` per component
  contract §3.4, i.e. those five sections default to hidden unless the section agent's own
  NOTES.md records a "Needs from merger" decision to do otherwise.
  - Whether the shipped page really wants these five sections to always be reachable (independent
    of the demo/staging toggle) is a product question outside a section agent's scope — worth a
    fork to Ivan when the section agents reach `proof-full`/`frame`/`included`/`pricing`/`faq`,
    rather than silently deciding a default.
- `reference/raw/00-shell.html` and `reference/rendered/00-shell.html` capture the **literal**
  `<nav>` element (links + the "Связаться" button) and the **literal** `<footer>` element — this
  matches the brief's measured byte counts closely, but it means the page logo (`<a href="/">`)
  sits **outside** both, as a sibling in the legacy DOM. The `shell` section agent will need the
  logo too (component contract §3.2 calls for a full `<header data-section="shell-nav">`); it is
  visible in `reference/shots/shell.png`'s surrounding context but not currently captured as its
  own file. Flagged here rather than guessed at — a scaffold stub, not a fidelity port.
