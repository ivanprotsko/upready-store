# Orchestrator A — foundation: render the repaint, decide cause E, write the coverage gate, land it in `dev`

Written 2026-09-08 02:40 WITA. Ivan is asleep; he approved nothing beyond the scope in this file.
Everything marked DECIDED here is the architect's default, taken because Ivan asked for launch prompts
and went to bed. Anything not covered: record a question in HANDOFF, do NOT wake him, do NOT guess wider.

## Launch

```
[DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface]
```

`node_modules` is installed there (pnpm install, 40 s, 2026-09-08 02:15). The branch carries the repaint
commits `5be7487` (52 files, 176 literal colours to 0) and `4dc8ccd` (the static repaint gate script).

Read first, in this order — every path verified to exist at the moment this file was written:

1. `/Users/ivanprotsko/upready/projects/upready-store/docs/prompts/2026-09-08-tfix-repaint-brief.md`
   — what the repaint was ordered to do (this file is on `dev`, not on your branch).
2. `artifacts/registries/theme-surface-defects.json` (in your worktree) — 14 defects, 6 process failures.
3. `artifacts/docs/2026-09-08-wave2-program.md` §2 and §5 (in your worktree) — why T-fix and T-gate must
   be in `dev` before any theme starts.

## Why you exist

The repaint has never been rendered. Not once. `node_modules` was missing when it was written, so all
four causes were fixed by static reasoning and a script that parses files without running them. Nine
themes are about to inherit whatever is actually on that screen.

## A1. Render it and look (no agents, you)

Bring up the stand from THIS worktree — backend and storefront, ports of your choosing that are free
(9022/9023/8027/8028/8031/8002/8003 are taken, `lsof -nP -iTCP -sTCP:LISTEN` before you pick). Seed is
the `sneakers` profile already on this branch.

Then walk the 14 defects of the registry with your own eyes, both modes, both viewports (390 and 1440),
and write the verdict per defect id into `artifacts/docs/2026-09-08-tfix-visual-verdict.md`: fixed /
still broken / not reachable. A defect you cannot reach is written down as not reachable, never as fixed.

## A2. Cause E — DECIDED: fix it at the source

`--contrast-fg-primary`, `-fg-secondary` and `-border-base` derive from `--destructive-foreground`, which
flips to `#0a0a0a` in dark mode while `--contrast-bg-base` stays fixed dark: about 1.0:1 on every inverted
surface (menu panel, delivery popup, cart badges, hero CTA). It is patched in `globals.css` scoped to dark
mode. That patch does not scale to nine themes.

Decision, unless Ivan says otherwise: add the missing `bridgeDark` rows to
`specs/design-system/token-map.json`, run `pnpm themes:build`, and REMOVE the `globals.css` patch, so the
fix lives in the bridge every theme is generated from. Then re-measure the contrast on the four surfaces
named above and put the numbers in the same verdict file. If the token-map fix turns out to change more
than those three variables, stop, keep the scoped patch, and record why in `q-cause-e-the-contrast-foreground`.

## A3. T-gate — the coverage gate (this is the real work)

The pilot's pixel gate proved the opposite of what was needed (process failure `p-02`): it compared
screenshots, so it went green while the text was invisible. Replace it with a gate that reads COMPUTED
STYLES, not pixels:

- Walks a page list (home, category, PDP, cart, account) in both modes and both viewports.
- For every text node with a background behind it, computes the contrast ratio and fails below 4.5:1
  (3:1 for text ≥ 24 px or ≥ 19 px bold).
- Asserts `body` background follows the theme (this is the check that was cut from the pilot brief, `p-05`).
- Reports per page, per mode, per viewport, with the failing selector and the two colours.

**Acceptance of the gate itself: run it on the state BEFORE the repaint** — the branch carries
`[data-theme-bridge="off"]` on `<html>` for exactly this (S1b's trick) — and it must go RED on the known
defects. A gate that is green on both sides is not a gate; that mistake is already in the registry.

Existing static gate `apps/storefront/scripts/theme-repaint-gate.mjs` stays; yours is the runtime half.

## A4. Land it

The wave needs BOTH the repaint (this branch) and the profile tooling (`feat/store-profiles`, which is
4 commits ahead of your base: `8dfe5fa`, `d5020c1`, `e50f05a`, `9a5cf8a`). Merge both into `dev` so that
orchestrator B branches from one place that has everything. Conflicts are likely only in `HANDOFF.json`
— resolve by keeping both task records, never by dropping a block (rule 19e: splice a shared document by
anchoring on both ends of your own block, never by line count).

Every `git commit` carries the `IVAN_OK=1` prefix. Do not push, do not deploy (21b/21c).

## Done means

- Verdict file with 14 rows, each with an eyes-on result and, where relevant, a measured ratio.
- Cause E fixed in the bridge or explicitly deferred with a reason.
- Coverage gate red before the repaint, green after, output committed.
- `dev` contains repaint + tooling; `pnpm build` green from `dev`.
- HANDOFF updated (`handoff.mjs status set`, `task update`), and a one-paragraph handover for orchestrator B
  naming the exact commit B must branch from.

Budget: this is Opus work; agents are allowed for A1 (walking the defect list) and A3 (writing the gate),
at most two at a time, disjoint file zones, English prompts. Downgrade to Sonnet on a subscription limit
rather than stalling. Spend zero dollars — no image generation happens in this window.

## Context economy (added 02:55, Ivan's explicit concern)

The pilot burned 300k+ context on one theme because the orchestrator collected full agent reports into its
own window and re-read them every turn, at long-context prices. In this window: your agents write their
reports to files under `artifacts/docs/` and return you at most 15 lines each (state, counts, path,
blockers). You never read an agent's report whole. Keep your own window under ~60k; if you approach it,
write the handover and stop rather than carrying the weight forward.
