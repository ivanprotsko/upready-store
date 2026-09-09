# Wave 1 critique and implementation plan (`t-2026-09-09-02`)

Critic pass over four scout maps and three mockups, judged against Ivan's order of 2026-09-09.
Read-only: no source file was touched. Every claim below cites a `file:line` in this repo or a
command run in this session with its literal output. Documents judged:
`2026-09-09-settings-persistence-deploy-map.md` (S1, 400 l.), `2026-09-09-block-port-map.md`
(S2, 183 l.), `2026-09-09-checkout-account-map.md` (S3, 137 l.),
`2026-09-09-upready-dev-links-map.md` (S4, 270 l.), `2026-09-09-panel-composition-mockup.md`
(D1, 399 l.), `2026-09-09-checkout-states-mockup.md` (D2, 330 l.),
`2026-09-09-account-mockup.md` (D3, 355 l.).

## 0 · Verdict

**Order item 1 (panel + site-wide persistence) is ready to build.** D1 + S1 give a complete,
mutually consistent architecture once four wording conflicts are resolved (§2). One defect: D1's
own "loaded" frame T1 draws a saved document that its own `FORBIDDEN` table forbids (§2.9).

**Order item 3 (pickup / payment / success / failure / account) is ready to build**, with one
blocking unknown that no document verified: whether `cart.metadata` survives onto `order.metadata`
(§3.2). Both mockups draw frames that depend on it.

**Order item 2 (deploy five stands + clickable upready.dev cards) has no executable plan.** No
Dockerfile exists (`find` → no output, S1 §7.2, re-confirmed this session), no
`COOLIFY_API_TOKEN` is on file, no domains are chosen, no footprint was measured, and this repo's
only deploy workflow is gated to a different owner (`notify-deploy.yml:94`). Four of the ten forks
in §4 block it. Card links (S4) are correctly sequenced *after* deploy and live in a foreign
project.

**The rendering work is larger than the order's wording suggests.** The composer vocabulary
(H1-H6, hero 9 values, P1-P5, F1-F6) is a static mockup tool, not a storefront feature
(S2 §1, S1 §2): 20 of 26 slot values are net-new React components. S2 priced them; nobody priced
their **strings** — see §3.4, a merge-bottleneck gap.

## 1 · Coverage: every clause of the order → document, route, component, or gap

| Order clause | Covered by | Route / component | Status |
|---|---|---|---|
| Hold-logo → password → popover (existing mechanics) | S1 §4, D1 §"Baseline S0–S11" | `modules/devtools/components/brand-unlock`, `theme-panel/popover.tsx` | Built, reused unchanged |
| Operator sets **default light/dark for visitors** | D1 §C6, S1 §5.2 | `app/layout.tsx` + new `lib/data/storefront-settings.ts` | Designed |
| Operator sets **header H1-H6** | S2 §3, D1 vocabulary | `(main)/layout.tsx:25` `<Nav/>` → new switch | Designed; H2-H6 unbuilt |
| **Hero** none/G/H/J/K/L/M/GA/GB | S2 §4 | `(main)/page.tsx:40` `<ProfileHero/>` | Designed; K only baseline. **L has no data schema** (`grep -c frames …/sneakers/profile.json` → `0`) |
| **Category tiles on/off** | S2 §5 | `(main)/page.tsx:41` `<CategoryTiles/>` | Designed, ~10 lines |
| **Listing P1-P5** | S2 §6 | `(main)/page.tsx:51` `<FeaturedProducts/>` | Designed; today's `ProductRail` matches no P-value |
| **Footer F1-F6** | S2 §7 | `(main)/layout.tsx:31` `<Footer/>` | Designed; F1 baseline, F4 needs a newsletter endpoint that does not exist |
| Config **persists server-side, all visitors** | S1 §5.2, D1 §C1-C5 | `store.metadata.storefrontSettings` + `GET/PUT /store/storefront-settings` | Designed |
| **Deploy the stands** | S1 §7 | none | **Gap — no Dockerfile, no host app, no domains, no token** |
| **upready.dev cards become links** | S4 §3-§5 | `upready-dev/index.html:922-933,1289-1297,1406-1407` | Designed, correctly deferred behind deploy |
| **Pickup-point selection** | S3 §2, D2 §1-§5 | `checkout-shipping-section`, new `checkout-pickup-point-sheet` | Designed; needs new seed (`"pickup"` fulfillment set) |
| **Payment states** | S3 §3, D2 §6-§8 | `checkout-payment-section`, new `demo-card-fields` | Designed |
| **Successful order** | S3 §4, D2 §9 | `/order/[id]/confirmed`, `order-completed-template` | Built + pickup extension designed |
| **Failed order** | S3 §3.3, D2 §10 | `/cart?error=…`, new `order-error-banner` | Designed. Confirmed unread today: `grep -n searchParams …/cart/page.tsx` → no output |
| **Account pages** | S3 §6, D3 §1-§7 | `/account/*` | Built; D3 adds timeline, pickup block, StatusDot, empty state |
| Per-profile default compositions | S2 §8, `composition-contract.json` `profileDefaults` | — | **Gap — nothing seeds them into `store.metadata` on a fresh stand** |
| Variant availability per profile | — | — | **Gap — validity models 2 forbidden pairs only, not "hero L is impossible on electronics"** (S2 §4) |

## 2 · Contract conflicts between documents, each resolved in one sentence

| # | Between | Conflict | Resolution |
|---|---|---|---|
| 2.1 | D1 §C1 vs `composition-contract.json` vs S2 §9 | Two schemas (`upready.storefront-settings/v1` with `updatedAt` vs `upready.storefront-composition/v1` with labels/citations) and two loader names (`getStorefrontSettings()` vs `getComposition()`) | The runtime document is D1 §C1 (`store.metadata.storefrontSettings`, six fields + `updatedAt`), the contract JSON stays a design-time vocabulary artifact, and the single loader is `getStorefrontSettings()`. |
| 2.2 | S1 §5.2 vs D1 §C3 | S1 revalidates by a backend → storefront round trip through `/api/revalidate` with a new `storefront-settings.updated` branch; D1 calls `revalidateTag()` inside its own PUT proxy | Adopt D1: the storefront proxy `/api/devtools/settings` holds the secret and revalidates in the same process, and `/api/revalidate` is left untouched. |
| 2.3 | S1 §6 table vs D1 §C6 | S1 lists "new `AXES` entries for header/hero/tiles/listing/footer", which would put the composition into `localStorage` and the pre-paint script — per browser | `AXES` (`lib/theme/attributes.ts:27-42`) keeps exactly its two axes; the composition never enters `localStorage`, since a per-browser composition is the opposite of the order. |
| 2.4 | S2 §2 / D1 facts vs Ivan's wording "home-page block" | Header and footer render in the `(main)` route group, not on `/` alone (verified: `Nav` at `(main)/layout.tsx:25`, `Footer` at `:31`) | Header/footer variants apply to the whole `(main)` group and leave the `(checkout)` group's own header alone; kept as fork F3 because it is Ivan's wording that is being widened. |
| 2.5 | S1 §5.2 vs D1 §C6 | S1 says `RootLayout` reads the loader "instead of / alongside" `readProfileTheme()`; D1 fixes a three-level order | Adopt D1's order verbatim: `localStorage` → saved `defaultMode` → `readProfileTheme()`, pre-paint script unchanged. |
| 2.6 | S3 §5 vs D2 §6 frame | S3 measured one live provider (`pp_system_default`); D2's frame 6 draws three chips including "Credit card" and "PayPal" | Build the demo card under the manual provider only; the extra chips are frame decoration and must not ship as fake providers. |
| 2.7 | D2 §2 (Berlin: Mitte/Kreuzberg/Friedrichshain/Neukölln) vs D3 §4a (Washington Warehouse, Pennsylvania Avenue NW 1600) | The two mockups display different pickup datasets for the same store | One seeded source wins: the new per-profile `"pickup"` fulfillment set (D2's fork b, persona city — sneakers' persona names Berlin, `profiles/sneakers/profile.json:7`), and D3's frames are re-labelled to those points. |
| 2.8 | D2 appendix vs D3 appendix | `PickupPoint.heading` = "Choose a pickup point" (D2) vs "Pickup point" (D3); `ShippingDetails.pickupPoint` duplicates the latter | One namespace: `PickupPoint.chooseHeading` (sheet title) and `PickupPoint.label` (display), authored once in the catalog package, with `ShippingDetails.pickupPoint` dropped. |
| 2.9 | D1 §T1 vs D1 §C4 / contract `validity[1]` | T1's mount payload is `defaultMode:"dark" … footer:"f6"`, exactly the pair `FORBIDDEN` blocks and T3 greys | T1 must be redrawn (or the saved example changed to `f3`) before it is used as an acceptance frame; the backend's 422 means that document could never have been saved. |
| 2.10 | `composition-contract.json` `profileDefaults.sneakers.hero = "l"` vs S2 §4 hero L row | The flagship stand's own default needs a `home.heroFrames` schema that does not exist (`grep -c frames` → `0`) | Seed sneakers with its alternate until the L package ships; a default that cannot render is not a default (fork F10). |
| 2.11 | S2 §2 / D1 facts (`layout.tsx:26,29`) vs the file | `Nav` is line 25 and `Footer` line 31 | Cosmetic drift, no design consequence; anchor on the component names when porting. |
| 2.12 | S3 §9 fork 3 ("port 9000 unreachable, `curl` → `000`") vs this session | All five stand backends answer: `9023 200 · 9041 200 · 9051 200 · 9061 200 · 9110 200` on `/health` | The deferred field-shape check is doable now against `localhost:9023`; it is no longer a blocking unknown, only an unstarted task (W0). |

## 3 · Claims made without evidence, and holes nobody filled

| # | Area | Gap | Severity |
|---|---|---|---|
| 3.1 | Pipeline | Two scout SUMMARY strings reached the orchestrator as the literal text `test` (S3 and D1), and one mockup arrived with no path at all — the documents on disk are complete, the handoff metadata was not | minor |
| 3.2 | D2 §9, D3 §4a | Both draw the pickup point on a **placed order** from `order.metadata.pickup_point_id`; the only citation is `lib/data/cart.ts:429-461` (`placeOrder`), which is not evidence that Medusa copies `cart.metadata` onto the order | **blocker** |
| 3.3 | D2, D3, S3 | Opening hours are drawn on 6 frames; no such field exists anywhere (`grep -rn opening apps/backend/src` → 0, D3's own facts table) and no owner is assigned | **blocker** for those lines |
| 3.4 | S2 (whole document) | 20 new components carry user-facing copy ("All products", "Shop {collection}", "from $X", newsletter form, chip labels) and the port map lists **zero** next-intl keys, while `messages/` holds 36 catalogs (`ls apps/storefront/messages \| wc -l` → `36`) — the one place parallel branches collide | major |
| 3.5 | S2 §3, §4 | "the storefront has no loader that returns category product counts" is stated without a command; three of five profile defaults (h5/h6) and hero J/GA/GB depend on that count | major |
| 3.6 | S1 §8 | No measured footprint for a Medusa + Postgres + Next triple; S1 correctly refuses to invent one, which leaves "do five fit on the box" unanswered | **blocker** for deploy |
| 3.7 | S1 §7.5 | No `COOLIFY_API_TOKEN` in the keys file, so no scripted deploy path exists today | **blocker** for deploy |
| 3.8 | S1, all | No stand domains are proposed (subdomain scheme, TLS names, per-stand `STOREFRONT_URL`/CORS values) | **blocker** for deploy |
| 3.9 | Everywhere | Nothing seeds `store.metadata.storefrontSettings` on a fresh stand, so a freshly deployed stand renders the H1/F1 baseline, not its per-theme composition | major |
| 3.10 | D1 fork 4 | Whether the five stands share one `REVALIDATE_SECRET` value was left unchecked, and the same question decides `STOREFRONT_SETTINGS_SECRET` rollout | minor |
| 3.11 | D2 §5 fact table | "Icons available" cites a `node -e` with no output shown; verified this session — `MapPin/Clock/MagnifyingGlass/Check/XMark/CheckCircleSolid/XCircleSolid` all `true`, and `CircleXmarkSolid` exists under that exact spelling | minor (claim holds) |
| 3.12 | D3 §3a | "Orders per demo customer stay under 20, so this list needs no search" — an assumption about seed data, uncited; acceptance criterion 3 depends on it | minor |
| 3.13 | S4 | Every edit lands in a **foreign project** (`~/upready/projects/upready-dev`), which this wave may not write (rule 5k); the card work needs its own session on that repo | major (process) |
| 3.14 | S2 §4 hero L | "electronics and supplements have ZERO frames" is cited to the composer's `/data.json`, i.e. to the mockup tool, not to the storefront's own profile schema, which has no frames at all | minor |

## 4 · Forks only Ivan can decide (merged across all seven documents)

| id | Question | Options | Recommendation | Blocks |
|---|---|---|---|---|
| F1 | Deploy host and domain scheme for the stands | (a) reuse Contabo `84.46.251.149` + Coolify/traefik + Cloudflare DNS `proxied=False`, as `agent-creatr` did; (b) a new host | (a), plus name the subdomain scheme now (e.g. `kerbstone.upready.dev`), since `STOREFRONT_URL`, CORS and TLS all need it | W17, W18, W19 |
| F2 | Four stands (Ivan's word) or five (five worktrees exist, all five answer locally: `8028/8061/8070/8081/8110` → `302`) | (a) all five; (b) name the one to cut | (a) — all five are equally ready and the fifth adds one triple, not a different architecture | W17-W19, W20 |
| F3 | Header/footer variants site-wide or home-only | (a) whole `(main)` group, matching where `Nav`/`Footer` render; (b) home route only | (a) — (b) means splitting rendering per route, a bigger uninstructed change than the ports | W5, W9-W12 |
| F4 | Visitor-facing mode toggle (nothing switches mode today) | (a) desktop nav cluster + a 6th bottom-nav slot, as D1 S11-S13; (b) desktop only; (c) none, operator default only | (a) — Ivan's own wording ("visitors who have not switched it themselves") presumes a visitor control | W7 |
| F5 | Demo failure mechanism | (a) storefront demo card, `…0000` inline decline + `…9999` redirect; (b) a backend demo provider module; (c) Stripe test keys on five stands | (a) — storefront-only, no keys, no five-backend redeploy, and it reaches the exact redirect target Stripe would | W13, W14 |
| F6 | Pickup points per profile: city, count, and who owns opening hours | (a) persona city, 4 points per profile, hours in `stock_location.metadata`; (b) reuse the single region warehouse and drop the picker; (c) hours omitted until a real field exists | (a) with hours in `metadata` — the picker is the whole point of item 3, and (b) leaves nothing to choose between | W11, W12, W15 |
| F7 | Media host for live stand images | (a) reuse `R2_BACKUP_*`; (b) a separate public-read bucket | (b) — backup and public media are different retention/access policies | W17 |
| F8 | How the first deploy is executed | (a) issue a Coolify API token into `~/upready/.env.keys` and script it; (b) a human/browser first deploy, script later | (b) for stand one (it is also where the footprint gets measured), (a) before stands two to five | W17, W18 |
| F9 | Sneakers' saved default is hero `L`, which has no schema and no assets | (a) ship L (profile schema + frames per profile + fallback panel); (b) seed the Kerbstone alternate until L exists | (b) — a default that cannot render is worse than a different default | W8, W12 |
| F10 | upready.dev cards: copy and target | (a) keep generic Russian titles, codenames only in `alt`; (b) show codenames; plus new tab vs same tab, and "Long Morning" vs "Long Mornings" (`recipe-showcase-cards.md:106`) | (a) + `target="_blank" rel="noopener"` (the file's own convention), and the stand's own header settles the spelling | W20 |

## 5 · Do the mockups draw their behaviour, and do they carry the acceptance?

| Mockup | Frames drawn | Acceptance by eye | Verdict |
|---|---|---|---|
| D1 panel | T1-T7 + S11-S13, ASCII, desktop and 390 px, including both failure frames and the open-row states | 8 criteria, the 6 required plus "forbidden combination unreachable from either side" and "a failed save loses no edit" | Pass, with the T1 defect (§2.9) to fix before it is used as an acceptance frame |
| D2 checkout | 10 numbered frames, each with route + component, 1440 and 390, including the state strip for validating/processing/declined | 8 criteria, the 6 required plus "failure page reachable by a real click with no keys" and "three separately styled lines per pickup row" | Pass; frame 6's phantom payment chips (§2.6) are the only thing to correct |
| D3 account | §1-§7, 1440 for every screen, 390 for login and compact-mobile for the rest (trade-off stated openly), empty states drawn | 8 criteria, the 6 required plus "the timeline's current step is never ambiguous" and "every action leaves a visible trace" | Pass; compact mobile frames are a stated budget trade-off, not an omission |

All three name their canon and were written before code, per rule 27d. None of the four **maps**
carries acceptance criteria, which is correct: maps are evidence, mockups are the promise.

## 6 · Branch topology (measured, and it simplifies the wave)

The five stands are worktrees on `feat/store/*`, but they carry **no application divergence**:

```
$ git diff --name-only dev feat/store/electronics | grep -c "^apps/"      → 0
$ git diff --name-only dev feat/store/electronics | grep -c "messages/"   → 0
$ git diff --name-only dev feat/store/electronics | wc -l                 → 49   (artifacts, HANDOFF, .gitignore)
```

The profile is chosen at build time by `NEXT_PUBLIC_STORE_PROFILE`
(`apps/storefront/scripts/build-profile.mjs:263`, `prebuild` hook at `package.json`). So the whole
wave lands **once on `dev`**, and each stand is the same code with its own env and its own seeded
database — no five-way port, no five-way merge. The only file family that still forces sequencing
is `apps/storefront/messages/*.json` (36 catalogs).

Machine checks available (from `apps/storefront/package.json`): `npx tsc --noEmit`,
`npx next lint`, `npx next build`, `pnpm test:unit` (vitest), and three dockerised Playwright
suites — `test:devtools` (`DEVTOOLS_URL`, `DEVTOOLS_PASSWORD`), `test:profile` (`PROFILE_URL`),
`ui-lab:test` — plus `themes:coverage`.

## 7 · Work packages

Contracts (W1-W5) land first on one branch. Everything marked `parallelSafe` may then run in its
own worktree against that seam. Catalog packages (W6C, W16C, W16D) touch all 36 catalogs and run
**sequentially on one branch**, chained by `dependsOn`. Notes carry the machine checks first, then
the human-eyes acceptance copied from the mockup — Ivan looks at the live stand.

| id | title | key files | dependsOn | catalogs | parallel |
|---|---|---|---|---|---|
| W0 | Preflight probes (no code) | — | — | no | yes |
| W1 | Composition types + validity | `lib/theme/composition.ts` | W0 | no | no |
| W2 | Backend settings routes + env | `api/store/storefront-settings/route.ts`, both `.env.template` | W1 | no | no |
| W3 | Loader + devtools proxy + tag | `lib/data/storefront-settings.ts`, `app/api/devtools/settings/route.ts` | W2 | no | no |
| W4 | SSR mode resolution | `app/layout.tsx` | W3 | no | no |
| W5 | Composition switch skeleton | `nav/index.tsx`, `footer/index.tsx`, `(main)/page.tsx`, `(main)/layout.tsx` | W3 | no | no |
| W6 | Panel UI (default mode, 5 rows, save, greying) | `theme-panel/popover.tsx` + new rows | W1, W3 | no | yes |
| W6C | Catalog A: visitor toggle strings | `messages/*.json` (36) | W7 | **yes** | no |
| W7 | Visitor mode toggle | `nav/index.tsx`, `bottom-nav/index.tsx` | W4 | no | yes |
| W8 | Seed per-profile defaults | new `scripts/seed-storefront-settings.mjs` | W2 | no | yes |
| W9 | Header H2/H3/H4 | `nav/variants/*`, `promo-banner` | W5 | no | yes |
| W10 | Category-count loader + H5/H6 | `lib/data/categories.ts`, `nav/variants/h5,h6` | W5 | no | yes |
| W11 | Hero G/H/M + listing P1-P5 data | `home/components/hero-*`, `listing-*`, `product-preview` | W5 | no | yes |
| W12 | Hero GA/GB (client) | `home/components/hero-ga`, `hero-gb` | W5 | no | yes |
| W13 | Footer F2/F3/F5/F6 (+shrink) | `footer/variants/*` | W5 | no | yes |
| W14 | Pickup seed (backend) | `migration-scripts/lib/fulfillment.ts`, `data/**` | W0 | no | yes |
| W15 | Pickup sheet + rows + summary | `checkout-pickup-point-sheet`, `checkout-info-rows`, `checkout-summary` | W14 | no | yes |
| W16 | Demo card + decline paths | `demo-card-fields`, `payment-button/providers/manual.tsx` | W0 | no | yes |
| W16B | Failure banner + success pickup block | `cart/page.tsx`, `order-error-banner`, `shipping-details` | W15, W16 | no | yes |
| W16C | Catalog B: checkout strings | `messages/*.json` (36) | W6C, W15, W16, W16B | **yes** | no |
| W17 | Account: StatusDot, timeline, pickup, empty states | `account/components/**`, `account-nav` | W15 | no | yes |
| W16D | Catalog C: account strings | `messages/*.json` (36) | W16C, W17 | **yes** | no |
| W18 | Playwright coverage for the new surfaces | `tests/devtools/**`, `tests/profile/**` | W6, W5 | no | yes |
| W19 | Deploy prerequisites (container, domains, secrets) | new `Dockerfile`s, deploy notes | F1, F2, F7, F8 | no | no |
| W20 | Deploy stand 1 + measure footprint | — | W19 | no | no |
| W21 | Deploy remaining stands | — | W20 | no | no |
| W22 | upready.dev card links (foreign repo, own session) | `upready-dev/index.html`, `check-showcase.mjs`, deploy script | W21, F10 | no | no |

Full per-package notes (machine checks, then the acceptance Ivan looks at) are carried in the
structured output that accompanies this document.

## 8 · Commands run in this session (evidence for the claims above)

```
$ for p in 8028 8061 8070 8081 8110 8303; do curl -s -m4 -o/dev/null -w '%{http_code}\n' http://localhost:$p/; done
302 302 302 302 302 200
$ for p in 9000 9023 9041 9051 9061 9110; do curl -s -m3 -o/dev/null -w '%{http_code}\n' http://localhost:$p/health; done
000 200 200 200 200 200
$ curl -s http://localhost:9023/store/payment-providers
{"type":"not_allowed","message":"Publishable API key required in the request header: x-publishable-api-key…"}
$ curl -s -o/dev/null -w '%{http_code}\n' http://localhost:9023/store/custom        → 400   (same gate on the custom scaffold)
$ ls apps/storefront/messages | wc -l                                               → 36
$ grep -c "PickupPoint\|OrderFailed\|OrderTimeline\|DemoCard" apps/storefront/messages/en.json → 0
$ grep -c frames apps/backend/src/migration-scripts/data/profiles/sneakers/profile.json        → 0
$ grep -n "searchParams" apps/storefront/src/app/[locale]/(main)/cart/page.tsx                 → (no output)
$ find . -maxdepth 3 -iname "Dockerfile*" -o -iname "docker-compose*" | grep -v node_modules   → (no output)
$ git diff --name-only dev feat/store/electronics | grep -c "^apps/"                           → 0
```
