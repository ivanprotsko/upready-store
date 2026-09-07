# T-fix repaint — orchestration consent record (rule 3b)

Written 2026-09-08, before arming the orchestration marker, by the session Ivan told to run the repaint.

## (1) Ivan's OK — verbatim, recorded twice

- 2026-09-08 ~01:45: «давай так, ты сейчас запустишь ремонт всех проблем, я через час вернусь и мы
  запустим оркестрацию на ночь»
- same turn: «запусти ремонт после /clear»

Both are quoted in `docs/prompts/2026-09-08-tfix-repaint-brief.md` (commit `0828724`) and in
`~/upready/.ai/resume/upready-store.md`, whose "what's next" block names running this repaint as the
first action of the fresh window. Ivan is away until ~02:45, so the OK cannot be re-asked without
losing the hour he explicitly allocated to the run.

## (2) Downgrade plan

**Decomposition.** Six zones, disjoint by path, no shared file, no shared build:
`skeletons` (79 occurrences / 12 files) · `layout` (15/7) · `catalog` = products+home+collections+
categories+store (27/6) · `checkout` = checkout+cart+order+shipping (25/8) · `account`+`common` (14/6) ·
`chrome` = app/** + styles/globals.css + tailwind.config.js (16/5). Sum = 176 = the measured total, so
the partition is provably complete, and `outline-none` splits 0+2+5+5+6+0 = 18, the measured total.

**Model per part.** Sonnet for the five mechanical zones — the decision is a table lookup from a role
map I measured out of the installed `@medusajs/ui-preset` 2.19.0 and `themes.css`, not a design call.
Opus only for `chrome`, which carries three of the four root causes (the `body{}` rule, the
`darkMode` selector, two CSS-hex leaks that the class grep cannot see) and where a mistake shows on
every page.

**Why quality holds.** Each agent gets the full replacement map, the exact utility names verified to
exist, and a return schema with before/after counts. None of them may run `tsc`, `next build` or
`pnpm` (BLOCKER C-02 from the process critique: six agents in one compilation closure is how the pilot
lost an hour), none may commit, none may write a shared file. Acceptance is NOT their reports: I re-run
the two greps myself across the whole tree, parse every changed file with the TypeScript compiler, and
read the diff hunks for non-colour changes before a single commit.

**Token estimate.** ~6 agents x 15–40k = 120–200k in the workers' own windows; what reaches this
window is six structured objects, ~2k total. That is the whole point of running it as a workflow
rather than as six Agent calls — the 350k-per-theme lesson.

**Downgrade if it fails.** If two or more zones die or return garbage, I finish solo: the map is
deterministic enough for `sed -i` per literal class, ~20 minutes of my own window for the 176
occurrences, and the 18 focus rings by hand. The gate is identical either way.

## Gate change forced by a measurement

`apps/storefront` in this worktree has **no `node_modules`** (measured: the directory is absent at all
three levels; the live pilot stand runs out of the `feat/store-profiles` worktree), and the machine
reports 84 MB unused of 16 GB. So `tsc --noEmit` from the brief cannot run here and installing now is
not safe. Replacement step, and it is weaker — say so, do not call it a type check: every changed
`.ts/.tsx` file is parsed with the TypeScript compiler from the main checkout
(`createSourceFile`, JSX enabled) and must produce zero syntactic diagnostics. That catches a broken
class string or JSX attribute, which is the only failure these edits can cause; it does not catch a
type error, and no type error is expected from editing string literals.
