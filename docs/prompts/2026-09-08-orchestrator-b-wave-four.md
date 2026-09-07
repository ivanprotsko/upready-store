# Orchestrator B — wave of FOUR profiles, grid image strategy, ceiling $4

Written 2026-09-08 02:45 WITA. Starts ONLY after orchestrator A reports that repaint + tooling are in
`dev` and the coverage gate is green there. Until then you have nothing to build on: the profile tooling
lives on `feat/store-profiles` and the repaint on `feat/store-theme-surface`; A merges both.

## Launch

```
[DIR: /Users/ivanprotsko/upready/projects/upready-store]
```

Read first — every path verified to exist when this file was written, all inside
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/` until A's merge lands them in `dev`:

1. `artifacts/docs/2026-09-08-wave2-program.md` — the nine themes (§1), the stages W0–W10 (§2), the branch
   topology (§4), the schedule and where it breaks (§5). You run four of the nine, not all nine.
2. `artifacts/docs/2026-09-08-wave2-stage-prompts.md` — the per-stage prompts, already written.
3. `artifacts/docs/2026-09-08-ivan-directives-image-strategy.md` §2, §3.1, §3.2 — the grid strategy and
   the prompt registry format Ivan requires.
4. `artifacts/registries/theme-surface-defects.json` — every stage gets the section that applies to it.
5. `artifacts/docs/process/01-steps.md` and `02-gates-and-handover.md` — the executable process.

## Scope, decided while Ivan slept

**Four themes, in this order:** `supplements` (light — the mirrored defect class, white on white, shows up
here first), `electronics` (dark — control that the repaint did not break what worked), `womens-fashion`,
`home-goods`. Nine will not fit the night: the heavy lane takes 52 min per profile and holds one at a time.

**Images — the grid strategy Ivan ordered (§3.1), prices measured tonight on the fal.ai model pages:**

| What | Model | Price | Per theme |
|---|---|---|---|
| 2 product grids 3x3 + 1 category-tile grid | `fal-ai/nano-banana` | $0.039/image | $0.12 |
| hero of the home page, full frame | `fal-ai/nano-banana-pro` | $0.15 (2K) | $0.15 |
| ONE showcase frame: the single product page that goes in the portfolio | `fal-ai/nano-banana-pro` | $0.15 at 2K, $0.30 at 4K | $0.15–0.30 |

≈ $0.42–0.57 per theme, $1.70–2.30 for four. **Hard ceiling for this night: $4.** If you reach it, stop
generating, finish everything that costs nothing, and write a question in HANDOFF.

Replicate's `nano-banana-2` price is published NOWHERE (checked three times over two days) — that is why
the wave moves to fal.ai, where the number is on the page. Key `FAL_KEY` is in `~/upready/.env.keys`;
$7.10 on the account, plus $1.97 left on Replicate as reserve.

**Measure before you spend the wave.** Three renders, ~$0.25, using the script that already exists
(`apps/backend/scripts/store-media/grid-experiment.mjs`, dry by default): does the model hold one light,
one background and one camera height across nine cells, and do the cell borders land where arithmetic says
they do. Slice on FOUND borders, never on thirds. If the answer is no, the grid strategy dies and you fall
back to full frames for the showcase product only, four themes, and you say so in the handover.

**Prompt registry is mandatory** (§3.2): shared preamble and per-cell subject clause stored SEPARATELY,
`kind: "single" | "grid-3x3"`, `cropBox` per cell, sha256 of the full prompt sent. Ivan must be able to
rebuild a single large render of one cell without rereading the whole text.

## How to run it

Pipeline, one worker per role, NOT four agents per stage — the retro measured that the tact is set by the
slowest role, not by the agent count (§5). Light lane W1 → W2 → W3 → W5 costs nothing in hardware; heavy
lane W6 → W7 holds ONE profile at a time (16 GB, two building processes measured). Prefer variant B: W6
has priority over W7, so a stand is visible as early as possible.

One worktree per theme (`feat/store/<theme>`), a branch each, merged into `feat/store-profiles-wave2`.
Disk: 8.9 GB free — check it before creating the fourth worktree, `pnpm` hardlinks from the store so a
worktree costs far less than `du` suggests, but `.next` is ~100 MB each and real.

Every `git commit` carries `IVAN_OK=1`. Subagents never commit. No push, no deploy.

## What Ivan sees when he wakes

- Four live stands, or fewer with a written reason per missing theme.
- A contact sheet: each theme, both modes, home + category + PDP, so he can judge in one screen.
- The visual gate W8 run by a creative director per theme — the pilot skipped it (`p-03`), you do not.
- The verdict per theme against `theme-surface-defects.json`: which of the 14 defect classes recur.
- The dollar total actually spent, from the fal.ai dashboard, not from an estimate.

Stop and record a question rather than inventing an answer: a theme that stalls is skipped, not waited for.
