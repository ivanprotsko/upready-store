# Orchestrator B — wave of profiles, one agent owns one theme, grid image strategy, ceiling $5

Written 2026-09-08 02:55 WITA, revised after Ivan said he sleeps 9–10 hours (so the window ends around
12:00, not 08:00) and that the pilot burned 300k+ context on ONE theme — which is the failure this brief
is built to prevent. Starts ONLY after orchestrator A reports repaint + tooling in `dev` with the coverage
gate green.

## Launch

```
[DIR: /Users/ivanprotsko/upready/projects/upready-store]
```

Read first — verified to exist when this file was written, in
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/` until A's merge lands them in `dev`:

1. `artifacts/docs/2026-09-08-wave2-program.md` §1 (the nine themes), §2 (stages W0–W10), §4 (branches), §5 (schedule).
2. `artifacts/docs/2026-09-08-wave2-stage-prompts.md` — per-stage prompts, already written.
3. `artifacts/docs/2026-09-08-ivan-directives-image-strategy.md` §2, §3.1, §3.2 — grid strategy, prompt registry.
4. `artifacts/registries/theme-surface-defects.json` — 14 defects, 6 process failures; each stage gets its section.
5. `artifacts/docs/process/01-steps.md`, `02-gates-and-handover.md` — the executable process.

Read nothing else whole. Everything below about your own context is a hard rule, not advice.

## The shape: one agent owns one theme, at most two alive

The pilot ran a stage per agent and the orchestrator collected every report into its own window: 300k+
tokens for one theme, re-read on every turn, at long-context prices. Do not repeat it.

- **One subagent owns one theme end to end** (W1 style board → W2 catalog → W3 images → W5 copy reconcile
  → W6 assembly). It is the only reader of its own intermediate work.
- **At most TWO theme agents alive at once.** Not because of tokens — because the machine holds two
  building processes (16 GB measured, `next build` + `medusa develop` + Playwright at 1–2 GB each).
  A third agent would queue on hardware anyway.
- **Your own window stays under ~60k.** You hold: the queue, one line of status per theme, the dollar
  ledger. You never read an agent's full report; the agent writes it to
  `artifacts/docs/2026-09-08-wave-<theme>.md` and returns you at most 15 lines: state, counts, cost,
  the path, blockers.
- **Each theme agent stays under ~150k.** Tell it so in its prompt, and tell it what to do at the limit:
  write its handover file and stop, so the NEXT agent resumes the same theme from disk instead of
  inheriting a bloated window. Resuming from a file is cheap; carrying 300k is not.
- Ban wide reads in the agent prompts: no repo-wide grep, no reading `node_modules`, no re-reading the
  program document in full — the stage prompt carries what the stage needs.
- Queue state lives on disk (`artifacts/wave/queue.json`), not in your head: theme, stage, agent, started,
  finished, cost, handover path. If you die, the next window continues from that file.

## Scope

Window is now ~9 hours, so the queue is **six themes, in this order**, and finishing four is a good night:

`supplements` (light — the mirrored white-on-white defect class shows up here first), `electronics`
(dark — control that the repaint did not break what worked), `womens-fashion`, `home-goods`,
`kids-toys`, `skincare`. Remaining three (`accessories`, `stationery`, `pet-supplies`) stay for the day.

**An unfinished theme is not a failure — a stalled theme that holds the queue is.** Skip it, write why,
move on. Never wait on a stuck agent (rule 5h: no busy-wait; one check by deadline).

## Images — Ivan's grid strategy, prices measured 2026-09-08 02:25 on the fal.ai model pages

| What | Model | Price | Per theme |
|---|---|---|---|
| 2 product grids 3x3 + 1 category-tile grid | `fal-ai/nano-banana` | $0.039/image | $0.12 |
| hero of the home page, full frame | `fal-ai/nano-banana-pro` | $0.15 (2K) | $0.15 |
| ONE showcase frame — the single product page that goes in the portfolio | `fal-ai/nano-banana-pro` | $0.15 (2K) / $0.30 (4K) | $0.15–0.30 |

≈ $0.42–0.57 per theme; six themes $2.50–3.40. **Hard ceiling for the night: $5.** At the ceiling you stop
generating, finish what costs nothing, and write a HANDOFF question.

Replicate's `nano-banana-2` price is published nowhere (checked three times over two days), which is why
the wave moves to fal.ai where the number is on the page. `FAL_KEY` is in `~/upready/.env.keys`; $7.10
there, $1.97 left on Replicate as reserve.

**Measure before you spend the wave:** three renders, ~$0.25, with the script that already exists
(`apps/backend/scripts/store-media/grid-experiment.mjs`, dry by default). Does the model hold one light,
one background, one camera height across nine cells, and do the cell borders land where arithmetic says?
Slice on FOUND borders, never on thirds. If the answer is no, the grid dies: fall back to a full frame for
the showcase product only, note it, and keep going.

**Prompt registry is mandatory** (§3.2): shared preamble and per-cell subject clause stored SEPARATELY,
`kind: "single" | "grid-3x3"`, `cropBox` per cell, sha256 of the prompt actually sent — so Ivan can rebuild
one cell at full size without rereading the whole text.

## Branches and hardware

One worktree per theme (`feat/store/<theme>`), merged into `feat/store-profiles-wave2`. Disk: 8.9 GB free
— `pnpm` hardlinks make a worktree cheap, but each `.next` is ~100 MB and real; check `df` before the
fourth worktree and drop a finished theme's `.next` before creating the next.

Every `git commit` carries `IVAN_OK=1`. Subagents never commit — you do. No push, no deploy (21b/21c).

## What Ivan sees when he wakes (~12:00)

- Live stands for the finished themes, or a written reason per missing one.
- A contact sheet: each theme, both modes, home + category + PDP, judged in one screen.
- W8 visual gate run by a creative director per theme — the pilot skipped it (`p-03`), you do not.
- Per theme: which of the 14 defect classes recurred, from `theme-surface-defects.json`.
- The dollar total actually spent, read from the fal.ai dashboard, not estimated.
- Token cost per theme, from the agent reports — the number the pilot never recorded for five of seven agents.

## Revision 03:10 — Ivan's answers, binding

1. **Eight themes, not six**: `supplements`, `electronics`, `womens-fashion`, `home-goods`, `kids-toys`,
   `skincare`, `accessories`, `stationery`. Order as listed (light first, dark second, then by risk).
   `pet-supplies` stays out — it has three option axes and is the most likely to stall.
2. **Budget is the whole fal.ai balance, $7.10, and it must cover regenerations.** Plan at $0.42–0.57 per
   theme = $3.4–4.6 for eight, plus $0.25 for the grid measurement, plus a 20 % reserve for reshoots
   ≈ $0.9. **Hard ceiling $6.00**, leaving $1.10 untouched. Ledger every prediction with its price into
   `artifacts/wave/spend.json` as you go — the pilot's `costUsd: 0` meant "not measured" and that must not
   happen twice. At $5.00 spent, stop generating anything that is not a reshoot of a rejected frame.
3. **Provider: fal.ai** (`FAL_KEY` in `~/upready/.env.keys`). Replicate stays untouched as reserve.
4. Subagents never commit; the parent window commits. Report ≤15 lines per theme agent.
