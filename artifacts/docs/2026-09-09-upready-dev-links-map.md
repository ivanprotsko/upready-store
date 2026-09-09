# upready.dev showcase cards → clickable links, and how the site deploys

Scout S4. Source project (read-only): `/Users/ivanprotsko/upready/projects/upready-dev`
(WB landing, static, no build step — `index.html` is the only file to edit, per
`upready-dev/AGENTS.md:9-11`). All line numbers below are from the files as read on
2026-09-09; the project's own recipe warns line numbers drift, anchors don't
(`artifacts/docs/recipe-showcase-cards.md:5-6`).

## 1. Card renderer today

`upready-dev/index.html:922-933`, inside `<section id="sec-showcase">`:

```html
<sc-for list="{{ cards }}" as="c" hint-placeholder-count="5">
  <article style="flex:0 0 min(78%,290px);scroll-snap-align:start;background:#fff;display:flex;flex-direction:column;padding:14px 14px 0">
    <div style="position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;border:1px solid #E4E4E7;border-radius:10px;background:linear-gradient(to top,#F4F4F5,#FAFAFA)">
      <img src="{{ c.img }}" alt="{{ c.alt }}" loading="lazy" style="...">
    </div>
    <div style="padding:22px 10px 26px;display:flex;flex-direction:column;gap:9px">
      <span style="...">{{ c.eyebrow }}</span>
      <h3 style="...">{{ c.title }}</h3>
      <p style="...">{{ c.desc }}</p>
    </div>
  </article>
</sc-for>
```

`cards` is built at `index.html:1406-1407` from the `showcase` getter (`index.html:1289-1297`)
by positional mapping:

```js
const cards = this.showcase
  .map(c => ({ cat: c[0], eyebrow: c[1], title: c[2], desc: c[3], img: c[4], alt: c[5] }));
```

`get showcase()` (`index.html:1289-1297`), 5 rows, 6 fields each — `[cat, eyebrow, title, desc, img, alt]`:

| # | eyebrow | title | theme (from recipe §2, `recipe-showcase-cards.md:102-108`) |
|---|---|---|---|
| 1 | Электроника | Магазин наушников | `electronics` → **Ferrite** |
| 2 | Одежда | Магазин одежды | `womens-fashion` → **Larchant** |
| 3 | Дом | Товары для дома | `home-goods` → **Long Morning** (recipe spells it "Long Mornings", plural; store repo task names it "Long Morning" singular — see fork below) |
| 4 | БАД | Магазин добавок | `supplements` → **Scruple** |
| 5 | Обувь | Магазин кроссовок | `sneakers` → **Kerbstone** (index.html titles it generically "Обувь / Магазин кроссовок"; alt text at showcase[4] says "демо-магазина кроссовок", no brand name in copy) |

Field `c[0]` (`'dtc'` in every row) is dead — categories/filters were removed 2026-09-08
(`recipe-showcase-cards.md:43-44`, "мёртвое поле … Ставить `'dtc'` и не думать").

Lead paragraph, `index.html:909`:
> "Пять витрин, собранных на том же решении, которое мы развернём вам: электроника, одежда,
> товары для дома, БАД и обувь. У каждой своя тема, свои шрифты и своя фотография — меняется
> оформление, а не движок."

(Recipe §1.5, `recipe-showcase-cards.md:73-81`, documents an *older* wording of this same
paragraph ending "…обувь — последняя показана страницей каталога"; the live file line 909 no
longer has that clause — the recipe text is stale, the file is current. Cite the file, not the
recipe, for exact copy.)

Section heading `index.html:908`: "Примеры магазинов". Micro-label `index.html:906`:
`{{ nShowcase }} · примеры` — a **section ordinal**, not a card count; leave alone
(`recipe-showcase-cards.md:85-86`).

## 2. Runtime binding: does `href="{{ c.url }}"` work?

Yes, and there is already a live precedent for a *dynamic* `href` on an `<a>`:
`index.html:1085` — `<a href="{{ payHref }}" target="_blank" rel="noopener" onClick="{{ payTry }}" ...>`.
`payHref` is a plain string computed in JS and interpolated exactly like `c.img`/`c.alt` today.

Mechanism, in `support.js`:

- `compileAttr(raw)` (`support.js:401-412`) treats **any** attribute value: if the whole value
  is one `{{ ... }}` expression it becomes `(vals) => resolve(vals, path)`; if it's mixed
  text+expr it interpolates all matches. This is attribute-name-agnostic — `href`, `src`,
  `alt`, `style` all go through the same function.
- `collectProps` (`support.js:415-443`) iterates every attribute on the node
  (`for (const {name, value} of [...node.attributes])`, line 419) and calls `compileAttr(value)`
  for each — there is no allowlist of attribute names, no special case for `href`. Event
  attributes (`onclick` → `onClick` etc., `EVENT_MAP` at `support.js:317-359`) and `style-*`
  pseudo-class attributes (`support.js:428`, `pseudoClasses.push(host.pseudoClass(...))`) are
  the only attributes handled differently; a plain `href` is not one of them.

So `href="{{ c.url }}"` needs no runtime change — it works the same way `img src="{{ c.img }}"`
already works on the same card, one attribute over.

## 3. Exact edit points to add a URL per card

Following the existing "five touch points" recipe pattern (`recipe-showcase-cards.md:13-15`):

1. **`get showcase()`, `index.html:1289-1297`** — add a 7th field `url` to each of the 5 rows,
   e.g. `['dtc', 'Электроника', 'Магазин наушников', '…', 'images/demo-electronics.webp', 'alt…', 'https://<stand-host>']`.
2. **`index.html:1406-1407`** — extend the positional map: `url: c[6]`.
3. **`index.html:922-933`** — markup change, see §4.
4. No change needed to `hint-placeholder-count="5"` (still 5 cards) or the lead paragraph
   (§1) unless card count or theme list changes.
5. If a card has no live stand yet, `url` must still resolve to *something* — see the open
   fork on placeholder scheme, §7.

## 4. Markup change: whole card becomes `<a>`

Current outer tag is `<article>` (`index.html:923`). Making the whole card clickable means
replacing that outer tag with `<a>`, carrying over every existing attribute plus link
attributes, keyed to the new `c.url` field:

```html
<sc-for list="{{ cards }}" as="c" hint-placeholder-count="5">
  <a href="{{ c.url }}" target="_blank" rel="noopener"
     style="flex:0 0 min(78%,290px);scroll-snap-align:start;background:#fff;display:flex;flex-direction:column;padding:14px 14px 0;text-decoration:none;color:inherit"
     style-hover="...">
    <div style="position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;border:1px solid #E4E4E7;border-radius:10px;background:linear-gradient(to top,#F4F4F5,#FAFAFA)">
      <img src="{{ c.img }}" alt="{{ c.alt }}" loading="lazy" style="...">
    </div>
    <div style="padding:22px 10px 26px;display:flex;flex-direction:column;gap:9px">
      <span style="...">{{ c.eyebrow }}</span>
      <h3 style="...">{{ c.title }}</h3>
      <p style="...">{{ c.desc }}</p>
    </div>
  </a>
</sc-for>
```

Notes, each backed by what's already in the file:

- **`text-decoration:none;color:inherit`** is required because the page's global rule
  `a{color:#2563EB;text-decoration:none}` / `a:hover{color:#18181B}` (`index.html:35-36`) would
  otherwise tint the whole card blue and underline nothing-in-particular; every other card
  in the page keeps its own text colors, so the anchor needs to neutralize the global `a` rule
  the same way a card, not a link, would look.
- **Hover state**: use `style-hover="..."` on the `<a>` itself, same mechanism as the two nav
  buttons directly above the showcase section (`index.html:913,916`,
  `style-hover="background:#FAFAFA;border-color:#D4D4D8"`) and the CTA buttons throughout
  (e.g. `index.html:160`). `host.pseudoClass(...)` (`support.js:428`) is how `style-hover`
  compiles; no new mechanism needed. A concrete value: border/background lift, e.g.
  `style-hover="border-color:#D4D4D8"` on the image wrapper, or a subtle `transform:translateY(-1px)`
  on the whole `<a>` — Ivan's call on the exact look, not blocking the wiring.
- **Keyboard focus ring**: the page defines **no** `outline:none`, `:focus`, or
  `focus-visible` rule anywhere (checked `index.html:27-41`, the only `<style>` block, and
  grepped the whole file — the sole two `outline:none` occurrences are on the two `<input>`
  fields at lines 1082/1103, unrelated). So "the page's own focus ring" = the **native
  browser default outline**, currently untouched on every other `<a>`/`<button>` in the
  file. The fix is negative: do **not** add `outline:none` to the card `<a>`, and do not let
  `style-hover` (which only fires on `:hover`, not `:focus`) stand in for a focus indicator.
  This makes the card tab-focusable and visibly focused for free, since `<a href>` is
  natively in the tab order and `<article>` was not.
- **`target`/`rel`**: every existing external link in the file uses
  `target="_blank" rel="noopener"` (6 occurrences: `index.html:71,107,160,198,1023,1042,1085,1089`
  — all point to `https://t.me/vladupready`). Matching that convention for the stand links is
  the consistent choice (see fork §7 for same-tab vs new-tab reasoning).

## 5. How `check-showcase.mjs` would assert every card has a resolvable link

Current script: `upready-dev/artifacts/docs/check-showcase.mjs` (48 lines). It already scrolls
the rail into view (`:19-27`, required because images are `loading="lazy"` and the section is
below the fold — first run without this scrolling silently reported `naturalWidth: 0` for all
five, per `recipe-showcase-cards.md:145-147`), then reads card fields via:

```js
const cards = await page.$$eval('#rail-cards article', els => els.map(a => ({
  eyebrow: ..., title: ..., src: img?.getAttribute('src'), nw, nh
})));
```

Two things the extension needs:

1. **Selector**: `#rail-cards article` (line 30) selects the outer tag by name. Once §4's
   change lands, the outer tag is `<a>`, not `<article>` — the selector must become
   `#rail-cards a` (or `#rail-cards > a`) or it will silently match zero cards and the script's
   `count` will read `0`, which is exactly the "defect only the eye would catch" failure mode
   the recipe warns about (`recipe-showcase-cards.md:15`).
2. **New field + assertion**: add `href: a.getAttribute('href')` to the per-card map (line
   30-38), then after the existing JSON dump (`:44`) add a check block in the same style as
   the existing pass/fail printouts used by the deploy script's `verifyLive()` (see §6) —
   e.g.:
   ```js
   const badLinks = cards.filter(c => !c.href || !/^https?:\/\//.test(c.href));
   ```
   and fail loudly (`bad.push(...)`/non-zero exit) if `badLinks.length`, mirroring how the
   script already collects `bad` (HTTP ≥400 responses, line 10) and `errs` (console errors,
   line 12) into the final JSON rather than just eyeballing it. The acceptance list in
   `recipe-showcase-cards.md:137-143` (`count`, `nw/nh`, `brokenImgs`, `unresolved`, `hscroll`)
   would gain a sixth line: "every card's `href` matches `^https?://` and is not the
   placeholder value."
   This script is read-only foreign code in this scout — the change is described, not applied.

## 6. Deploy script: `deploy-upready-dev.mjs`

Full path: `upready-dev/artifacts/scripts/deploy-upready-dev.mjs` (269 lines). Deploys the
static site to Cloudflare Pages project `upready-landing`, domain `upready.dev` (zone
`6ee6ea29a5911f31944f4e6cfc2257da`), per the header comment (`:1-15`) — "Вариант A": the WB
landing owns `upready.dev`, the older Astro landing (`landing-upready-astro`) stays on its own
`pages.dev` subdomain.

Modes (`:51`, matched from `process.argv`):

| flag | what it does |
|---|---|
| `--check` (default) | read-only: lists staging dir contents, live Cloudflare Pages domains for both projects, DNS records for both `upready.dev`/`www.upready.dev`, and runs `verifyLive()` against the *current* prod host (`:194-223`) |
| `--stage` | builds `artifacts/.publish/` (copies `index.html`, `support.js`, `_headers`, `images/` — `PUBLISH` array, `:36-41`) and lists it; touches no network |
| `--deploy` | full: stage → `wrangler pages deploy <stage-dir> --project-name upready-landing --commit-dirty=true` (`:235-238`, `WRANGLER = '/Users/ivanprotsko/.bun/bin/wrangler'`) → move the two DNS-bound custom domains from `landing-upready-astro` to `upready-landing` (`moveDomains`, `:165-178`) → PATCH both CNAME records to `upready-landing.pages.dev` (`patchDns`, `:180-189`) → poll Pages API until both domains report `status:"active"` (`waitActive`, `:152-163`, 5 min timeout) → `verifyLive()` against both live hosts, body-content checks (not just status codes) |
| `--rollback` | reverses `moveDomains`/`patchDns` back to `landing-upready-astro`, verifies `upready.dev` responds 200 |

Gate: `--deploy` and `--rollback` require `IVAN_DEPLOY_OK=1` in the environment (`:225-227`,
`if (process.env.IVAN_DEPLOY_OK !== '1') die(...)`) — `--check`/`--stage` need no env var and
touch no live state beyond read-only Cloudflare API calls.

Two Cloudflare tokens, not interchangeable (`:63-65`): `CLOUDFLARE_API_TOKEN` for Pages,
`CLOUDFLARE_CF_ADMIN_TOKEN` for zone DNS — both read from `~/upready/.env.keys` (names only,
per this scout's own hard rules).

**`verifyLive()` (`:114-149`)** checks live-body content, not HTTP status: fetches `/`, checks
it contains the section marker "Примеры магазинов" and the current image filename
`demo-sneakers-catalog.webp` (this literal string is now stale — see gap below); checks each
`MUST_NOT_PUBLISH` path (`HANDOFF.json`, `AGENTS.md`, etc.) does **not** byte-match the local
file (Pages' SPA fallback returns 200+index.html for any path, so status alone proves
nothing, `:131-132`); checks the demo image serves with `content-type: image/webp`.

**No `wrangler`/Cloudflare cache purge call anywhere in this script** (grepped for `purge`,
zero hits) — confirmed gap, see §6a.

### 6a. What the previous deploy did — cache staleness gap

`~/upready/memory/cloudflare-pages-same-filename-stale-asset-2026-09-09.md` (measured
2026-09-09, same deploy chain): `wrangler pages deploy` succeeded, the new 960×1280 webp was
correctly on disk in `artifacts/.publish/`, but `https://upready.dev/images/demo-electronics.webp`
kept serving the old 1280×873 asset — response headers showed `cache-control: public,
max-age=86400`, `cf-cache-status: HIT`, `age: 278` (lines 12-16 of that note). Diagnosis: when
an asset **keeps the same filename**, the edge treats it as the same object and the deploy
does not invalidate the cached copy; a file that got a **new** name (`demo-sneakers.webp`) came
through immediately — that contrast is what proved the mechanism (lines 18-21). Fix documented
but **not yet in the deploy script**: after a same-filename deploy, `POST
.../zones/<zone>/purge_cache` with the exact URLs (`upready.dev/`, each changed image URL, both
hosts) using `CLOUDFLARE_CF_ADMIN_TOKEN` (lines 25-34); verify by response **body**
(`curl` + `magick identify`), never by status code, and a cheap pre-purge probe is
`?v=<timestamp>` — if that returns the new file, the deploy was fine and only the edge cache is
stale (lines 36-39). Side notes from that same deploy (lines 43-50): the script's step-3
"domain belongs to nobody, this is a 522" message was a false alarm when the domain was
*already* bound to the target project (DELETE 404 + POST "already added" is the **success**
path, not failure — `moveDomains()` already encodes this via the `alreadyBound`/error-code
`8000018` check at `:170-176`, so this specific false alarm is already handled in code); and a
removed asset (`demo-sneakers-catalog.webp`) kept serving 200 from Pages' object store after
removal from the repo — "not in the repo" and "not on prod" are different claims.

**Consequence for this task**: showcase-card `img` filenames already rotate per recipe (new
theme = new `demo-<slug>.webp` name, `recipe-showcase-cards.md:17`), so the stale-cache trap
mainly bites `index.html`/`support.js` themselves (same filename every deploy) and any card
image that gets **re-shot but keeps its slug** — not the new `url` field being added here,
which is plain text inside `index.html` and rides the same cache-bust-by-content path as the
rest of the page's markup (still subject to the *page's own* cache staleness if `index.html`'s
name never changes — same root cause, same fix: purge `upready.dev/` and `www.upready.dev/`
after any deploy that doesn't rename `index.html`).

## 7. Open forks

| Question | Options | Recommendation |
|---|---|---|
| Open stand links in a new tab or the same tab? | (a) `target="_blank" rel="noopener"`, matching every existing external link in the file (6 occurrences, `index.html:71,107,160,198,1023,1042,1085,1089`, all to `t.me/vladupready`); (b) same-tab navigation, keeping the visitor on the stand and losing upready.dev | (a) — it is the page's own established convention for "leave the site," and a demo stand is exactly that: an outbound destination, not a step in the current flow. |
| What URL goes in `c.url` before the 5 stands are actually deployed (Ivan's order item 2, downstream of this task)? | (a) leave the field empty/`'#'` and skip the `<a>` wrapper conditionally (adds branching logic to a currently-static template — the runtime supports it via `sc-if` per other blocks in the file, e.g. `index.html:794` `fillersPricing` pattern, but it's new complexity here); (b) point at a per-stand localhost URL as an interim placeholder that only works on Ivan's machine (misleading if the page is previewed by anyone else, and `check-showcase.mjs` would then need to allow-list `http://localhost` as "resolvable"); (c) hold the markup/data-shape change ready (this scout's deliverable) but only fill real `url` values once stands are actually deployed and reachable, keeping today's non-linked `<article>` cards live until then | (c) — ship the code path in this task's sibling PR, but keep cards as plain `<article>` (no `<a>`, no `url` data) until stand URLs exist; flipping 5 literal strings in `get showcase()` plus the two markup lines (§4) is a small, low-risk follow-up once real hosts are known, and it avoids ever publishing a dead or localhost-only link on the live upready.dev. |
| Card title/theme naming: use the internal codenames (Kerbstone/Ferrite/Scruple/Larchant/Long Morning, per Ivan's task text) in the visible copy, or keep the current generic Russian titles ("Магазин наушников" etc.)? | (a) keep generic category titles as-is, since the landing's copy rule is "русский, никаких брендов на видном месте" and the existing `eyebrow`/`title` pairs already read as generic-but-concrete; (b) add the codename into `eyebrow` or `desc` (e.g. eyebrow "Электроника · Ferrite") | (a) for the visible on-page copy (matches `AGENTS.md`'s style rule, "копия только на русском", and the codenames are internal/English); reserve the codenames for the `alt` text or an HTML comment near each `showcase()` row so a maintainer can match card → stand without changing user-facing copy — Ivan's call if he wants the brand visible. |
| `home-goods` theme name: "Long Morning" (Ivan's task text, singular) vs "Long Mornings" (recipe doc, plural) | Two spellings exist in this session's own inputs | Flag to Ivan — cite both sources (`recipe-showcase-cards.md:106` "Long Mornings" vs the task text "Long Morning") rather than silently picking one; whichever the stand itself displays in its header (per the recipe's screenshot source) is authoritative. |

## 8. Files read (all read-only, per this scout's hard rules)

- `upready-dev/AGENTS.md`
- `upready-dev/index.html` (targeted reads: 1-41, 69-71, 107, 160, 198, 223-236, 400-937,
  1023-1131, 1280-1330, 1400-1420, 1461, 1572)
- `upready-dev/support.js` (targeted reads: 290-490)
- `upready-dev/_headers`
- `upready-dev/artifacts/docs/recipe-showcase-cards.md` (full, 177 lines)
- `upready-dev/artifacts/docs/check-showcase.mjs` (full, 48 lines)
- `upready-dev/artifacts/scripts/deploy-upready-dev.mjs` (full, 269 lines)
- `~/upready/memory/cloudflare-pages-same-filename-stale-asset-2026-09-09.md` (full, 51 lines)
