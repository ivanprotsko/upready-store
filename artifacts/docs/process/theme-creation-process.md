# The store-profile creation process — index

Author: process author (Opus), 2026-09-08. Worktree
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`, branch `feat/store-profiles`,
head `d39d10b`.

Ordered by Ivan on 2026-09-08: *"проследить весь процесс создания предыдущей темы и составить
воспроизводимый бизнес-процесс"* (`artifacts/docs/2026-09-08-ivan-directives-image-strategy.md:124`). A
process critic on a different model will attempt to break this document by replaying real pilot events
against it (`…ivan-directives-image-strategy.md:134-136`), so every claim carries its source as `path:line`
or the command that produced it.

Two classes of number appear and are never mixed. **Measured** — copied from a command run in this session,
or from a document that prints the command it ran; the command is named. **Not measured** — the pilot did
not run it; where a retro published an extrapolation it is cited *as an extrapolation* and never allowed to
stand as fact.

Nothing was built, started, seeded or committed for this document. No process on `:8028`, `:9023`, `:8027`
or `:9022` was touched.

---

## §0. Scope and definition of done

### 0.1 What is being produced

One **store profile**: a self-contained data package plus the preset and blocks that render it
(`docs/store-profiles/00-program-2026-09-07.md:39-49`).

```
apps/backend/src/migration-scripts/data/profiles/<id>/
  profile.json          upready.store-profile/v0
  catalog/{categories,collections,product-options,products}.json
  theme.json            upready.theme-preset/v0, light + dark
  i18n/{en,de,fr,es,ru}.json
  media/manifest.json   upready.store-media-manifest/v0   + media/*.webp (gitignored)
  design/style-board.md
```

Switching `STORE_PROFILE` / `NEXT_PUBLIC_STORE_PROFILE` / `STORE_MEDIA_BASE_URL` and seeding one database
per profile produces a different shop (`00-program-2026-09-07.md:51`). Topology decision F1 = one database
and one backend+storefront pair per profile (`00-program-2026-09-07.md:59`).

### 0.2 Definition of done — "one profile shipped"

A profile is shipped when **all fourteen** statements below are true on disk or on the live stand. Each is
observable by a third party who was not in the run. Anything less is `in progress`, whatever the reports say.

| # | Observable | Where it is proven | Step |
|---|---|---|---|
| DoD-1 | The files of §0.1 exist under `data/profiles/<id>/` and validate against `specs/store-profiles/*.schema.json` and `specs/design-system/theme-preset.schema.json` | `node apps/backend/scripts/validate-store-profile.mjs <id>` exit 0, counts printed | W6 |
| DoD-2 | 12–16 products, 3–5 categories over two levels, 2 collections, five locales present | validator counts, recounted from the files | W2 |
| DoD-3 | Renders = products + 5, exactly; `accepted + flagged = renders`; manifest rows = files on disk = sha256 rows, counted three times independently | W3 report + orchestrator recount | W3 |
| DoD-4 | A database `upready_store_<id>` seeded from scratch holds the catalog counts, read with `psql`, not from a log | W6 acceptance | W6 |
| DoD-5 | Every product image URL returns HTTP 200 and every rendered `<img>` has `naturalWidth > 0` | W6 curl sweep + W9 | W6, W9 |
| DoD-6 | `tsc --noEmit` 0, `next lint` clean, `next build` 0, unit suites green **with their reverse runs red** | W6, W9 | W6, W9 |
| DoD-7 | **G-COVERAGE** exits 0: every rendered colour on every surface belongs to the active preset, in both modes and both viewports | `pnpm --filter storefront theme:coverage`, JSON under `artifacts/registries/theme-coverage/` | W7 |
| DoD-8 | **G-FOCUS** holds: `outline-none` count ≤ `focus-visible:ring` count, and 0 focus stops fall back to the user-agent ring | grep identity + coverage rule R8 | F1, W7 |
| DoD-9 | **G-VISUAL** is filled and signed: groups A–E all `meets`, group F listing every flagged frame by decision | `artifacts/docs/<date>-<id>-visual-acceptance.md` | W8 |
| DoD-10 | Wordmark, `<title>` suffix and footer carry `profile.brand.name`; `Upready Store`, `Medusa`, `Powered by` do not occur in rendered text | coverage rule R15 | W7 |
| DoD-11 | Adversarial verification from a `DROP` + reseed refutes nothing | W9 report | W9 |
| DoD-12 | Every flagged frame has a written decision — replaced, accepted by name, or deferred — and none is shipped by omission | G-VISUAL group F | W8, W11 |
| DoD-13 | The HANDOFF entry carries the numbers, the visual-acceptance path, the coverage JSON path, the render count and the **word `unmeasured`** where cost is unmeasured | `handoff.mjs task update --append-details` | W10 |
| DoD-14 | Ivan has opened `http://localhost:<STOREFRONT_PORT>/en` and said yes | his own words | stop gate |

**Not part of done:** public deployment, the media host for deploy, and the theme-switch panel — all
explicitly out of programme scope (`00-program-2026-09-07.md:13`, `:120-124`).

### 0.3 The one sentence this process exists to prevent

The pilot passed every gate it defined and Ivan then found 14 visual defects on 13 screens with his own
eyes (`artifacts/registries/theme-surface-defects.json:5-7`, `:92-203`). DoD-7, DoD-8 and DoD-9 are the
statements that were absent from the pilot's definition of done.

---

## The four modules, in execution order

Read them in this order; each opens by naming this index as its parent.

| Module | Come here for |
|---|---|
| [`00-roles-and-zones.md`](./00-roles-and-zones.md) | **§1 Roles** — who owns what, what each may never touch, which survive the pilot and which two were missing. **§2 The file-zone map** — every directory of `apps/storefront/src` and `apps/backend/src` assigned to exactly one zone, with the arithmetic that closes the "20 of 302" hole, and the rule for touching another zone. |
| [`01-steps.md`](./01-steps.md) | **§3 The steps** — 15 numbered blocks (`id`, owner, trigger, inputs, work, outputs, gate, acceptance, evidence, measured duration), in dependency order, including the four the pilot never had. |
| [`02-gates-and-handover.md`](./02-gates-and-handover.md) | **§4 Gates** — all 14, what each proves and cannot prove, machine vs human eyes, and which of the 14 defects each catches. **§5 Handover protocol.** **§6 The brief rule** and the p-05 diff rule. |
| [`03-failures-and-economics.md`](./03-failures-and-economics.md) | **§7 Failure catalogue** — four root causes, six process failures, two cases the process must tolerate. **§8 Economics.** **§9 What this process still cannot do.** **§10 Open questions** — where the record did not settle it and I decided. |

---

## Step numbering, and the three schemes it reconciles

The record carries three incompatible numbering schemes for the same work: the pilot's own `S0–S8`
(`00-program-2026-09-07.md:104`), the retro brief template's `S0–S14`
(`artifacts/docs/retro/brief-analysis.md:637-804`), and wave 2's `W0–W10`
(`artifacts/docs/2026-09-08-wave2-program.md:52-72`). This process uses **F1–F3** for work done **once per
wave** and **W0–W11** for work done **once per profile**, and maps both older schemes onto it.

| This process | Runs | Name | Pilot code | Retro template | Wave-2 code |
|---|---|---|---|---|---|
| **F1** | once per wave | Storefront repaint | — *(nobody owned it)* | S4–S10 | T-fix |
| **F2** | once per wave | Coverage gate built | — *(did not exist)* | — | T-gate |
| **F3** | once per wave | Foundation truthfulness fixes | part of S1a / S6a debt | inside S11 acceptance | — |
| **W0** | per profile | Setup | S0 | S0 | W0 |
| **W1** | per profile | Style board | S2 | S1 | W1 |
| **W2** | per profile | Catalog and image briefs | S3 | S2 | W2 |
| **W3** | per profile | Images | S4 | S3 | W3 |
| **W4** | per profile | Theme preset | part of S6a | part of S11 | W4 |
| **W5** | per profile | Copy reconciled against renders | S5 *(never ran)* | — | W5 |
| **W6** | per profile | Assembly and stand | part of S6a | S11 | W6 |
| **W7** | per profile | Coverage gate run | — *(did not exist)* | part of S13 | W7 |
| **W8** | per profile | Human visual acceptance | — *(skipped)* | S12 | W8 |
| **W9** | per profile | Adversarial verification | S7 *(never ran)* | S13 | W9 |
| **W10** | per profile | Handover | S8 *(never ran)* | S14 | W10 |
| **W11** | conditional | Flagged-frame second pass | — *(deferred by Ivan)* | — | — |

The foundation built once by the pilot and **not rebuilt per profile** — the `STORE_PROFILE` seed switch
and price-ratio table, the 113-row theme bridge and `themes:build`, the pre-paint script and font
allow-list, the profile blocks, the Replicate driver, `store-profile:validate` and `store-profile:up` —
is listed at `brief-analysis.md:570-575` and `2026-09-08-wave2-program.md:44`. Recount before relying on
any number in it.

**The wave does not start until F1, F2 and F3 are merged into `dev`**
(`2026-09-08-wave2-program.md:49`) — otherwise nine profiles inherit the same fourteen defects and nine
parallel hands try to fix them.

---

*Nothing in this process was built, started or committed. The orchestrator commits.*
