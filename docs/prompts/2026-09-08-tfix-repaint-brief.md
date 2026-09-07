# T-fix — storefront repaint brief (F1), written 2026-09-08 01:4x for the session that runs it

Order from Ivan, 2026-09-08 ~01:45, verbatim: «давай так, ты сейчас запустишь ремонт всех проблем, я
через час вернусь и мы запустим оркестрацию на ночь» — then, «запусти ремонт после /clear». So this
brief is the whole input; the running session does not have to reconstruct anything from a transcript.

- **Worktree:** `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-theme-surface`
  (branch `feat/store-theme-surface`, at `e50f05a`, 19 commits ahead of `dev` and 3 behind — it carries
  the pilot tree, which is where the fourteen defects are visible).
- **Defect registry (input, read it first):**
  `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles/artifacts/registries/theme-surface-defects.json`
  — 4 root causes, 14 defects, 6 process failures.
- **Token sources:** `apps/storefront/src/styles/themes.css` (31 canon tokens per preset per mode) and
  `specs/design-system/token-map.json`.

## The four causes to fix

| Cause | Measured baseline | Fix |
|---|---|---|
| A `body` unstyled | zero `body{}` rules across `apps/storefront/src/styles/*.css`; `layout.tsx:33` renders `<body>` with no className; every probed `h1/h2` computes `rgb(0,0,0)` on `rgb(10,10,10)` | `html, body { background: var(--background); color: var(--foreground); }` in `globals.css` — both properties, one rule |
| B literal Tailwind colours | **44 files, 176 occurrences**: `bg-gray-100` x53, `bg-gray-200` x21, `bg-white` x18, `text-white` x10, `bg-black` x9, `text-zinc-600` x7, `border-gray-200` x7. By area: skeletons 12 files/79, layout 7/15, products+home 5/26, checkout+cart+account 10/14, common 4/7, app pages 4 | replace with canon tokens or `-ui-` tokens the bridge reaches |
| C focus unstyled | **18 `outline-none` against 4 `focus-visible:ring-*`**; `--ring` exists per preset (sneakers `#d6ff3b` dark, `#4c6600` light) and is unused | every `outline-none` you touch gains `focus-visible:ring-2 focus-visible:ring-[var(--ring)]` in the same class list |
| D darkMode selector mismatch | `tailwind.config.js:4` is `darkMode: "class"` while the theme switches on `data-mode`; zero `dark` classes and zero `dark:` utilities in `src` | either the repaint never uses `dark:` utilities, or the config moves to `darkMode: ['selector','[data-mode="dark"]']` proved by a throwaway element computing red under `data-mode=dark` and not under light, then removed |

## Six repaint zones — disjoint by path, run in parallel

1. `src/modules/skeletons/**`
2. `src/modules/layout/**`
3. `src/modules/products/**`, `src/modules/home/**`, `src/modules/collections/**`, `src/modules/categories/**`, `src/modules/store/**`
4. `src/modules/checkout/**`, `src/modules/cart/**`, `src/modules/order/**`, `src/modules/shipping/**`
5. `src/modules/account/**`, `src/modules/common/**`
6. chrome: `src/styles/globals.css` (cause A), `tailwind.config.js` (cause D), `src/app/**`

## Rules every zone agent gets

- Work ONLY inside your zone's paths. A file outside it is not yours even if it is broken.
- Change **only** a colour class, a focus ring, or an import. A diff line touching layout, spacing,
  structure or copy is a defect in your run.
- Never run `tsc`, `next build` or `next lint` — the orchestrator runs the gate once after all six return
  (this is the fix for critique BLOCKER C-02: six agents share one compilation closure).
- Never commit. The orchestrator commits.
- Never use `dark:` utilities; use tokens that resolve per `data-mode`.
- Exceptions are NOT written to a shared file (parallel writers would collide): return them in your
  result and the orchestrator writes `src/styles/allow-literal-colours.json` once.

**Return schema:** `{zone, filesChanged[], occurrencesBefore, occurrencesAfter, outlineNoneInZone,
focusRingsAdded, exceptions[{file, class, reason}], notes}`.

## Gate the orchestrator runs once, after all six

```sh
cd apps/storefront/src
grep -roE "(bg|text|border|ring|fill|stroke|from|to|via)-(white|black|neutral-[0-9]|gray-[0-9]|grey-[0-9]|zinc-[0-9]|slate-[0-9]|stone-[0-9])" . | wc -l   # was 176
test "$(grep -roE 'outline-none' . | wc -l)" -le "$(grep -roE 'focus-visible:ring' . | wc -l)"        # was 18 vs 4
tsc --noEmit
```

Then ten diff hunks spot-checked for non-colour changes, then one commit.

## Scope note from the night arithmetic

If the hour runs short, the four portfolio screens come first — home, category listing, PDP, cart —
and account/checkout go to a second pass. Ivan returns ~02:45 and the night wave starts after that.
