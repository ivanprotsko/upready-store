# S3 — Kerbstone catalog and image briefs

Stage S3 of the `store-profiles` pilot. Written by the merchandiser-copywriter, 2026-09-07.
Binding inputs: `apps/backend/src/migration-scripts/data/profiles/sneakers/design/style-board.md` (S2),
`specs/store-profiles/catalog-products.schema.json`, `specs/store-profiles/README.md`.
Every number below is copied from the output of a script named in §5; none is estimated.

## 1. What was written

| File | Contents |
|---|---|
| `apps/backend/src/migration-scripts/data/profiles/sneakers/catalog/categories.json` | 2 roots, 5 leaves, seed shape |
| `.../catalog/product-options.json` | `Size`, `Colourway`, `Colour`; hex on every colour value |
| `.../catalog/collections.json` | `new-arrivals`, `bestsellers`, membership generated from the products |
| `.../catalog/products.json` | 14 products, 225 variants, one `imageBrief` each |
| `.../i18n/en.json` `de.json` `fr.json` `es.json` `ru.json` | categories, collections, product title + description, option terms |
| `.../design/style-board.md` | appendix 9(c) only — the `___` replaced by the one-line rationale |

Nothing else was touched. No `profile.json`, no `theme.json`, nothing under `media/`.

## 2. Category tree and why it is shaped this way

```
footwear/            (root)
  low-tops           3 products     <- home tile 1
  high-tops          3 products     <- home tile 2
  runners            3 products     <- home tile 3
  trail              2 products     <- home tile 4
accessories/         (root)
  care-and-spares    3 products
```

The four handles the style board §6.2 fixes for the home tiles exist as footwear leaves. The care kit
and the two lace cuts are not shoes, so a second root carries them: a home tile links to
`/categories/<handle>`, and a bottle of cleaner appearing under "Low tops" would be a real bug on a real
page. Five leaves, two roots, and every product sits on a leaf.

## 3. Assortment

Model names follow the style board's naming convention (§1): a piece of street infrastructure plus the
shape. Prices are set per model, never per size.

| handle | category | colourways | sizes (EU) | variants | price USD | collections |
|---|---|---|---:|---:|---:|---|
| `gutter-low` | low-tops | Tar black, Sulphur, Concrete | 38–46 (9) | 27 | 139.00 | new-arrivals, bestsellers |
| `sett-low` | low-tops | Chalk, Tar black | 38–45 (8) | 16 | 119.00 | new-arrivals |
| `flagstone-low` | low-tops | Concrete, Oxblood, Chalk | 39–45 (7) | 21 | 129.00 | bestsellers |
| `bollard-high` | high-tops | Tar black, Diesel, Sulphur | 38–46 (9) | 27 | 159.00 | bestsellers |
| `gantry-high` | high-tops | Diesel, Concrete | 39–46 (8) | 16 | 149.00 | new-arrivals |
| `stanchion-high` | high-tops | Oxblood, Tar black | 40–45 (6) | 12 | 169.00 | new-arrivals |
| `verge-runner` | runners | Chalk, Sulphur, Tar black | 38–46 (9) | 27 | 145.00 | bestsellers |
| `camber-runner` | runners | Sulphur, Diesel | 38–44 (7) | 14 | 99.00 | new-arrivals |
| `towpath-runner` | runners | Concrete, Tar black, Chalk | 38–45 (8) | 24 | 129.00 | new-arrivals |
| `culvert-trail` | trail | Diesel, Oxblood | 38–46 (9) | 18 | 189.00 | bestsellers |
| `cattle-grid-trail` | trail | Oxblood, Tar black, Concrete | 40–45 (6) | 18 | 175.00 | new-arrivals |
| `care-kit` | care-and-spares | — | — | 1 | 29.00 | bestsellers |
| `flat-waxed-laces` | care-and-spares | — | — | 1 | 9.00 | bestsellers |
| `round-waxed-laces` | care-and-spares | Tar black, Sulphur, Chalk | — | 3 | 12.00 | new-arrivals |

`gutter-low` is out of stock in EU 39 across all three colourways, so the PDP state drawn in style-board
frame 4 ("size 39 out of stock") is backed by the data rather than by a mock-up.

**Price band.** The brief fixes sneakers at 89–189 USD and accessories at 9–39 USD, and every price is
inside it. Style-board §2 describes the persona's band as $140–$210, which is higher; where the two
disagree the brief was followed, and this is flagged rather than silently reconciled — see §7.

**Colourways.** Two or three per sneaker, drawn from the style board's six-name vocabulary, every one
carrying `metadata.hex` taken from §1 of the board: Tar black `#0A0A0A`, Sulphur `#D6FF3B`, Concrete
`#8A8A8A`, Oxblood `#4A1418`, Chalk `#E8E4DC`, Diesel `#1F2A2E`. S5 will correct only the hex of the
colourway a render actually depicts; the rest stand as written.

**SKUs.** `SNK-<MODEL>-<SIZE>-<COLOUR>`, e.g. `SNK-CATTLEGRIDTRAIL-45-CONCRETE`. On the accessories the
size slot carries what the product is actually sized by — `OS` for the kit, the lace length in cm for the
laces (`SNK-FLATLACES-140-TARBLACK`).

## 4. Image briefs

One `imageBrief` per product, and each has **exactly one shot, role `hero`**. Wave-2 roles (`angle`,
`detail`, `lifestyle`, `colorway`) are described once in style-board §5.3 and are not repeated per
product, so nothing downstream can read a second render out of this file.

`subject` is written as a description of an object, not of a photograph, because it is substituted into
`{subject}` in the packshot template of style-board §5.4. Length runs 199–325 characters, above the
120-character floor the brief sets.

`doNotShow` carries the same twelve lines on every product: real logos and brand marks; legible text,
letters or numbers; a tread, heel-tab or side-panel device copied from an existing model; human faces,
hands, feet, mannequins or foot forms; a pair, a second shoe or a left shoe; props, plinths, boxes,
tissue paper, gravel or foliage; coloured or gradient backgrounds, gels, neon or flare; wet, glossy or
mirrored floor, reflections, a second shadow, a floating subject; flat lay, dutch angle or tilted
horizon; shallow depth of field, bokeh or motion blur; HDR, oversaturation, heavy vignette or upscaling
artefacts; anything naming a real place or a real shop. That is style-board §5.6 items 1–11 plus the
brief's two mandatory entries.

`images` is one relative ref per product, `media/<handle>-hero.webp`. 14 product refs + the home hero +
the four category tiles = **19 image references**, which the validator prints as its own recount and
which is exactly the pilot's render budget.

## 5. Measurements

Everything in this section is script output. Commands were run from
`/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`.

### 5.1 The orchestrator's validator

`apps/backend/scripts/validate-store-profile.mjs` exists. Run against the profile directory as it stands,
it stops before any catalog check:

```
$ cd apps/backend && node scripts/validate-store-profile.mjs sneakers --skip-media
Store profile "sneakers" is missing profile.json
exit=2
```

`profile.json` and `theme.json` are stage S1c/S6 files and are outside this agent's zone, so the
validator was instead run over a **throwaway fixture** in the scratchpad: my four catalog files and the
style board copied verbatim, plus a disposable `profile.json` and `theme.json` built from the style
board purely to get past the two existence checks. Nothing from that fixture was written into the repo.

```
$ node scripts/validate-store-profile.mjs sneakers --skip-media --dir <scratchpad>/fixture/sneakers
store profile: sneakers
recounted from the catalog files:
  products      14
  variants      225
  image refs    14 (unique files: 14)
  declared      products 14, variants 225, images 14
media:         skipped (--skip-media)
images referenced by catalog and home: 19

OK — every check passed.
exit=0
```

That run exercises the real cross-checks: category-is-leaf, option-title-exists,
variant-option-declared, variant-option-value-exists, variant-option-complete, the collection
membership checks in both directions, the counts recount, and "no absolute URL in an image field".

### 5.2 Independent Ajv run and the counts

`node <scratchpad>/check.mjs` — Ajv 8.20.0 in `strict: true` with `ajv-formats`, compiling
`specs/store-profiles/catalog-products.schema.json` and validating `catalog/products.json`:

```
AJV strict, catalog-products.schema.json: PASS
products               : 14
variants               : 225
imageRefs              : 14
rootCategories         : 2 ["footwear","accessories"]
leafCategories         : 5 ["low-tops","high-tops","runners","trail","care-and-spares"]
collections            : 2 ["new-arrivals:8","bestsellers:7"]
singleVariantProducts  : 2 ["care-kit","flat-waxed-laces"]
descChars min/max      : 551 / 683
specRows min/max       : 8 / 10
title max / subtitle max: 33 / 53
imageBrief.subject min/max: 199 / 325
shots length==1 && role==hero for all 14: YES
every product.category is a LEAF        : YES
every variant option value exists      : YES
Colourway values carrying metadata.hex : 6 / 6
Colour values carrying metadata.hex    : 3 / 3
footwear products                      : 11 min distinct sizes: 6
colourways per sneaker min/max         : 2 / 3
sneaker price min/max                  : 99 / 189
accessory price min/max                : 9 / 29
every variant has price_usd            : YES
one price per model (not per size)     : YES
no http anywhere in images/imageBrief  : YES
collections referenced by products     : ["new-arrivals","bestsellers"]
collections.json matches products.json : YES
products per leaf                      : {"low-tops":3,"high-tops":3,"runners":3,"trail":2,"care-and-spares":3}
```

Against the brief's constraints: 14 products, ≥2 single-variant non-footwear products (2), every footwear
product on ≥6 sizes (minimum measured: 6), 2–3 colourways per sneaker (measured 2–3), descriptions inside
300–1400 (measured 551–683), 6–10 spec rows (measured 8–10), sneakers 89–189 (measured 99–189),
accessories 9–39 (measured 9–29).

### 5.3 Translations

`node <scratchpad>/check-i18n.mjs` — compares every locale's key set against the catalog files, refuses a
description that is byte-identical to the English one, and scans for trademarks with word boundaries:

```
en: products 14 · categories 7 · collections 2 · optionTitles 3 · optionValues 18 · desc 551-683 chars · OK
de: products 14 · categories 7 · collections 2 · optionTitles 3 · optionValues 18 · desc 595-770 chars · OK
fr: products 14 · categories 7 · collections 2 · optionTitles 3 · optionValues 18 · desc 584-791 chars · OK
es: products 14 · categories 7 · collections 2 · optionTitles 3 · optionValues 18 · desc 575-731 chars · OK
ru: products 14 · categories 7 · collections 2 · optionTitles 3 · optionValues 18 · desc 527-693 chars · OK
trademark scan, word-boundary, 31 brand strings over 6 files: real hits 0 []; known word collisions
["fila = Spanish \"fila de ojales\" = row of eyelets"]
exit=0
```

**Five locales, 14 translated products each = 70 title/description pairs.** Each locale also carries all
7 category names, both collection names, 3 option titles and 18 option values.

The first version of that scan matched on bare substrings and reported "puma" and "fila". Both were
ordinary words — Spanish `espuma` (foam) and `fila de ojales` (row of eyelets), French `filature`
(spinning mill) — so the scan was rewritten with word boundaries. Spanish `fila` still matches at a word
boundary because it genuinely is a Spanish word; it is listed as a known collision with the sentence it
appears in rather than quietly removed from the brand list.

**On the translations themselves.** Model names stay in Latin script in every locale, the way a shop
writes a product name; the colourway names are translated as brand colour names (Teerschwarz / Noir
goudron / Negro alquitrán / Чёрный гудрон), and the descriptions are written in each language rather
than glossed. German uses trade vocabulary — Sprengung, Cupsole, Zwischensohle, Vollrindleder — and
French, Spanish and Russian likewise use their own footwear terms (drop / entresuela / промежуточная
подошва) rather than calques of the English. Whether that clears the acceptance bar "descriptions read as
written by a shop" is a human judgement and is listed in §7 as unverified by me.

The locale files add one key the seed's own i18n files do not have, `translations.productOptions`, because
the brief requires the option terms and the seed shape has nowhere to put them. Everything else follows
`data/i18n/json/en.json` exactly: `name` at the top, then `translations.categories`,
`translations.collections`, `translations.products` keyed by camelCase handle with `title` and
`description`.

## 6. Exact commands

```
node <scratchpad>/gen-catalog.mjs                       # writes the four catalog files
node <scratchpad>/i18n-en.mjs                           # en.json, from products.json
node <scratchpad>/i18n-de.mjs                           # de.json
node <scratchpad>/i18n-fr.mjs                           # fr.json
node <scratchpad>/i18n-es.mjs                           # es.json
node <scratchpad>/i18n-ru.mjs                           # ru.json
node <scratchpad>/check.mjs                             # Ajv strict + every count in §5.2
node <scratchpad>/check-i18n.mjs                        # locale key sets + trademark scan
cd apps/backend && node scripts/validate-store-profile.mjs sneakers --skip-media
cd apps/backend && node scripts/validate-store-profile.mjs sneakers --skip-media --dir <scratchpad>/fixture/sneakers
```

`<scratchpad>` is
`/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/a37c19d2-805b-4969-a2e1-545a5d69e4de/scratchpad`.
The generators and checkers live there, not in the repo, because they are S3 working tools and not
deliverables. The style-board edit was made with `perl -i -pe` on the single anchored line; the file was
943 lines with 27 headings before and after, and `git diff --stat` shows `1 insertion(+), 1 deletion(-)`.

## 7. What I could not verify

1. **The full validator on the real profile directory.** It needs `profile.json` and `theme.json`, which
   belong to S1c/S6 and are outside my file zone. The clean `exit=0` in §5.1 is from a throwaway fixture
   holding copies of my files. Whoever assembles the profile at S6 should re-run it in place.
2. **The renders.** Every check was run with `--skip-media`. No file under `media/` exists, so
   image-to-manifest, sha256 and on-disk existence are all unchecked. `media/<handle>-hero.webp` is a
   promise to S4, not a fact.
3. **"Descriptions read as written by a shop"** is a human-eyes criterion. I can report that no
   description is a copy of the English and that the trade vocabulary is language-native; I cannot certify
   that a German or Russian shopper finds them natural. A native reader should sample at least
   `stanchion-high` and `culvert-trail` in de and ru, which carry the densest construction vocabulary.
4. **Trademark clearance.** §5.3 is a string scan against 31 brand names I chose; it is not a registry
   search. Style-board §9(b) already records that no USPTO/EUIPO query was made for "Kerbstone" either.
   The model names (Gutter, Sett, Flagstone, Bollard, Gantry, Stanchion, Verge, Camber, Towpath, Culvert,
   Cattle grid) are common English nouns for street infrastructure and were not cleared as marks.
5. **The price band disagreement** in §3: brief 89–189 versus style-board §2's $140–$210 persona band. I
   followed the brief. If the board's band is the one that matters, five models need re-pricing; the
   decision is not mine to take silently.
6. **The `Size` option label.** The brief names the option `Size` and the style-board frames label the
   cells "Size (EU)". The catalog option title is `Size` with bare numeric values, per the brief, and the
   "(EU)" is carried in the locale files' option title and in a `Sizing` spec row on the products that
   have one. If the storefront renders the raw option title, the scale word will be missing from the PDP.
7. **The packshot template and the three accessories.** Style-board §5.4 hard-codes "A single right shoe,
   alone in frame" after `{subject}`. That sentence is wrong for a care kit, a coil of laces and three
   coils of laces. Their `subject` and `shot` strings describe the objects and the layout correctly, but
   S4 cannot paste them into the §5.4 template unchanged — it needs a still-life variant of the template
   for those three products, or three frames that contradict their own prompt.
