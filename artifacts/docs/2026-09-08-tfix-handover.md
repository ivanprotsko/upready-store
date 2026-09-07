# T-fix / T-gate handover — what the parent commits, and what orchestrator B branches from

Orchestrator A of the night wave, 2026-09-08 03:21 WITA. Companion documents:
`2026-09-08-tfix-visual-verdict.md` (the walk, cause E, the numbers) and
`2026-09-08-tgate-notes.md` (the gate's build notes).

## 1. The tree the parent commits

Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface`, branch
`feat/store-theme-surface`, head `4dc8ccd`, left dirty on purpose — a subagent does not commit (rule 21).

```
git add -- apps/storefront/package.json \
           apps/storefront/scripts/extract-theme-sources.mjs \
           apps/storefront/scripts/theme-coverage-gate.mjs \
           apps/storefront/src/styles/globals.css \
           apps/storefront/src/styles/themes.css \
           specs/design-system/token-map.json \
           artifacts/docs/2026-09-08-tfix-visual-verdict.md \
           artifacts/docs/2026-09-08-tgate-notes.md \
           artifacts/docs/2026-09-08-tfix-handover.md
```

`pnpm-lock.yaml` is also modified — that is the parent's own `pnpm install` from 02:31, not this window's
work; commit it or not by the parent's judgment, but do not attribute it to T-fix.

Two logical commits, if the parent wants them separated:

- **cause E at the source** — `extract-theme-sources.mjs`, `token-map.json`, `themes.css`, `globals.css`
- **the coverage gate** — `theme-coverage-gate.mjs`, `package.json` (one script line `themes:coverage`),
  and the three documents

Nothing under `src/**` changed. The repaint itself was already committed in `5be7487`.

## 2. Verification, run in this window

| Check | Result |
|---|---|
| `npx tsc --noEmit` (apps/storefront) | **exit 0**, clean |
| `npx next build` (apps/storefront) | **exit 0**, 11/11 static pages, no warnings |
| `pnpm themes:extract` + `pnpm themes:build` | reproduce `token-map.json` and `themes.css` exactly as committed |
| runtime coverage gate, pre-repaint `:8028` | 198 failing nodes, exit 1 (**red before** — met) |
| runtime coverage gate, post-repaint `:8044` | 64 failing nodes, exit 1 (**not green after** — see §4) |

The build ran with the dev server stopped and `.next` cleared first, so it is a cold, honest build.

## 3. A4 — the merge, measured rather than predicted

The brief expected conflicts in `HANDOFF.json`. **There are none, anywhere.** Measured with
`git merge-tree` against the real merge bases, without creating a branch or touching a worktree:

- merge base of `dev` with both feature branches: `7211bcaa`
- `dev` (at `e27378e`) changed 47 files since that base; `feat/store-theme-surface` 162;
  `feat/store-profiles` 120
- **`dev` ∩ `feat/store-theme-surface` = 0 files. `dev` ∩ `feat/store-profiles` = 0 files.**
- since their own common ancestor `e50f05a`, the two feature branches changed **disjoint** file sets
- `git merge-tree` conflict markers: **0** for `dev + feat/store-theme-surface`, **0** for
  `feat/store-theme-surface + feat/store-profiles`
- `HANDOFF.json` was changed by `dev` only; neither feature branch touched it

So either merge order works and both should be fast, conflict-free three-way merges. Recommended order:
`feat/store-theme-surface` first (it carries the foundation the wave depends on), then `feat/store-profiles`.
Re-run `npx next build` from `dev` after the second merge — this window verified the build on the branch,
not on the merged result, and that distinction matters.

## 4. What orchestrator B inherits, and the one thing to decide first

**B branches from the parent's merge commit on `dev`** — not from `4dc8ccd`, and not from
`feat/store-profiles`. That commit does not exist yet at the time of writing; the parent must name it to B.

The foundation B inherits is real: all four repaint causes are gone from the rendered page (163 of 198
failing nodes, the whole white-on-white and black-on-black population), cause E is fixed in the bridge so
every theme generated from it inherits the fix, and there is a runtime gate that goes red on a broken theme.

**Three token-level defects survive and every one of the nine themes will inherit them.** They are described
with numbers in §3 of the verdict document. In the order they will hurt:

1. **`--primary-foreground` does not follow the accent's polarity** — 1.13:1 on sneakers' lime accent.
   Every primary CTA in the store. Any theme with a light accent reproduces it exactly.
2. **`--fg-muted` is below AA in both modes** — 4.28:1 light, 3.65:1 dark. 54 of the 64 remaining failing
   nodes are this one token; it carries footer and checkout-heading copy.
3. **`--fg-on-color` on `--bg-overlay`** — 1.08:1, the mobile drawer (d-14), cause E's sibling at a call site
   rather than in a token.

Fixing 1 and 2 in the bridge is a small change of the same shape as cause E and would take the gate from 64
failing nodes to about 6. **That decision was not taken in this window** — it is outside A1/A2/A3 and it is a
design call about what a theme's accent foreground should be, which belongs to Ivan or the architect, not to
a foundation agent. It is the highest-value single action available before the wave starts.

## 5. Bringing the stand back

The post-repaint stand was stopped after the build (the wave-2 program's own rule: a stand that is not being
looked at is 2 resident processes for nothing). The pre-repaint stand on `:8028` and the backend on `:9023`
were left running — they are not this window's processes.

```
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface/apps/storefront
node scripts/build-profile.mjs && pnpm exec next dev --turbopack -p 8044
```

`apps/storefront/.env.local` is already in place (gitignored): it points at the existing backend on `:9023`,
profile `sneakers`, `NEXT_PUBLIC_BASE_URL=http://localhost:8044`. Ready in about 4 seconds.

To re-run the gate against both stands:

```
pnpm themes:coverage -- --url http://localhost:8028   # expect exit 1, 198 nodes
pnpm themes:coverage -- --url http://localhost:8044   # expect exit 1, 64 nodes
```

## 6. One process note for the parent's error journal

The batch-cost guard (`5j`) blocked the launch of this window's single gate agent. The trigger was the phrase
"Every failure line carries…" in the agent's prompt — a description of the **script's own output format** —
read as an unbounded batch of LLM work items, and priced at 1000 items. One agent writing one file is not a
batch. The launch went through on the sanctioned `BATCH_OK` marker, but the guard should learn the class:
a count or an "every X" quantifier inside a specification of a **program's output** is not a fan-out size.
Suggested class name for `ai-err.mjs`: `output-format-as-batch`.
