# Block Contract

One block variant lands in one PR, on a `templates/*` branch, against `templates/main`, never `dev`. A
template is a manifest over the storefront's existing composition, so a block is a component plus a
registry entry, and you never add a second theming path.

## 1. One Folder and One Line in Its Category File Make a Block

Put the block in `apps/storefront/src/modules/blocks/<category>/<variant>/`, kebab-case:

- `index.tsx` holds the component, a server component unless it needs state.
- `props.ts` holds the props type and its parser.
- `block.ts` holds the registry entry, a `BlockEntry<YourProps>` from `modules/blocks/types.ts`.

Then add one line to the category file, `modules/blocks/<category>/index.ts`, in path order:

```ts
export { richText } from "./rich-text/block"
```

That folder and that line make the whole diff of a block PR. Never touch `registry.ts`, `types.ts`,
`package.json` or `messages/*.json`:

- `registry.ts` imports every category file already, sorts each by variant, and puts the composition
  variants first and then the categories in the order of `BLOCK_CATEGORIES`.
- `types.ts` declares every category and every role already. The categories are `header`, `hero`,
  `tiles`, `listing`, `footer`, `announcement`, `text`, `media`, `columns`, `collection`, `testimonials`,
  `newsletter`, `banner`, `collage`, `slideshow`, `faq`, `video`, `blog`, `promo`, `countdown`, `trust`,
  `delivery` and `contacts`. The roles are those of R1's `roles.json`, plus the registry's own.
- `lucide-react` is already a dependency of the storefront.
- Lab strings live in props, not in the catalogs (§2).

A block that needs a new category or a new role is a question for the lead, not a line in your PR.

The entry carries these fields:

| Field | What you write |
|---|---|
| `id` | `<category>/<variant>`, the name a template uses |
| `category`, `variant` | the two halves of the id; `category` is the folder the block lives in |
| `title` | an English working name for the playground and the contact sheet |
| `roles` | what it draws, from `BLOCK_ROLES`: `section-header`, `heading`, `cta-primary`, `card-image`… |
| `data` | where its content comes from: `products`, `categories`, `shop`, `profile`, `static` |
| `status` | `lab` for a new block, `live` once the composition contract and the panel know it |
| `placement` | `home` for a home section; `site` is reserved for header and footer |
| `parseProps`, `fixtures` | see sections 2 and 4 |

The composition variants (header h1 to h6, hero g h j k l m ga gb, tiles, listing p1 to p5, footer f1
to f7) are registered by reference in `modules/blocks/existing.ts`. Never move or copy one. Its entry
points at the live registry's own component, and `registry.test.ts` fails when a composition key has
no entry or the entry points elsewhere. A new variant of one of those categories written for
templates goes into that category's file like any other block.

## 2. Props Are Typed and Parsed With the Shared Helpers, Data Comes Through a Loader

- Type the props in `props.ts`. `parseProps(input)` returns `{ ok: true, value }` or `{ ok: false, errors }`.
  The template validator calls it for every section of the block, absent props included.
- Build it from `modules/blocks/shared/parse.ts`, one call per field. Every helper takes the raw value
  and its path and puts the path in front of each error (`items[1].title.ru is 95 characters, at most 90`):

```ts
export const parseRichTextProps = (input: unknown) =>
  parseProps<RichTextProps>(input, "text/rich-text", {
    header: (value, path) => parseSectionHeader(value, path),
    body: (value, path) => parseLocalizedText(value, path, { max: 600 }),
    align: (value, path) => parseEnum(value, path, ["left", "center"], { fallback: "left" }),
    cta: (value, path) => parseObject(value, path, { label: …, href: … }, { optional: true }),
  })
```

| Helper | Takes |
|---|---|
| `parseProps(input, blockId, fields)` | the whole props; absent props are `{}`, unknown keys are refused |
| `parseObject(value, path, fields, { optional? })` | a nested object: a button, a list item |
| `parseList(value, path, item, { min?, max, fallback? })` | a list, each item under `path[i]` |
| `parseLocalizedText(value, path, { max, fallback? })` | shop text, see below |
| `parseHref(value, path, { required? })` | `/…` inside the shop or `https://…`; not `//host`; absent is null |
| `parseEnum(value, path, allowed, { fallback? })` | one of a list |
| `parseInteger(value, path, { min, max, fallback? })` | a whole number in range (not `parseInt`: that name is the global's) |
| `parseBoolean(value, path, { fallback })` | a switch |
| `parseImageRef(value, path, { optional? })` | a picture, §3 |
| `parseIcon(value, path, { fallback? })` | an icon name, §3 |
| `parseSectionHeader(value, path)` | the section header, §3 |

- Shop text is `LocalizedText`, `{ "<locale>": "…" }`, keyed by the codes of `src/i18n/config.ts`.
  `pickText(text, locale)` from `shared/localized-text.ts` picks the visitor's language, then English, then
  any, and answers null when there is nothing.
- **While a block is `lab`, every visible string comes from its props as `LocalizedText`,** its own
  chrome included: a button label, a form placeholder, a «see all», an empty-state line. Put a Russian
  and an English default in `props.ts` and pass it as `fallback`, so a template that names the block
  without props still reads well. Never a literal in the component, and never a `messages/*.json` edit.
  The next-intl keys for all 36 catalogs come in one batch PR, the day the blocks go `live`.
- Catalogue data is read through a `"use server"` loader in `src/lib/data`, never a fetch in the
  component. List what it reads in `data`.
- With nothing to show, the block renders `null`. An empty frame is not an empty state.

## 3. One Section Shell, Tokens Only

- Wrap the block in `BlockSection` (`shared/block-section.tsx`). Only a full-width bar such as
  `announcement/text-bar` draws its own markup.

```tsx
<BlockSection block="text/rich-text" locale={await getLocale()} header={header} width="content">
  …
</BlockSection>
```

  - It puts half of `--layer-section-gap` (3rem without a template) above the section and half below,
    so two sections stand one gap apart. Never add your own outer margin or padding.
  - `width: "content"` holds the children in the content container. `"full"` gives a banner or a
    slideshow the page's width, and the header stays in the container.
  - The header is `{ eyebrow, heading, description, seeAll }`, parsed by `parseSectionHeader`. It is
    drawn only when it has words, with the roles `section-header`, `label`, `heading`, `description`
    and `cta-secondary`. That is the one heading style of every home section; never draw your own `h2`
    above a block.
  - It writes `data-block`, the block's id.
- Pictures are an `ImageRef` (`shared/image-ref.ts`), exactly one of:
  - `{ "product": "<handle>", "index"?: n }`, picture n of one of the shop's own products;
  - `{ "category": "<handle>" }`, the picture the owner gave a category;
  - `{ "src": "/templates/<template-id>/<file>" }`, a file committed under
    `apps/storefront/public/templates/<template-id>/`. It must be made for us; no third-party image, stock
    or competitor's, is ever committed.
  - `alt` is `LocalizedText` on all three.

  `resolveImageRef(ref, locale)` from `src/lib/data/block-image.ts` turns one into
  `{ url, alt, width, height }` through the shop's own loaders. It answers null when the product, the
  category or the picture is not there, and the block then shows its empty state. Medusa keeps no
  dimensions, so `width` and `height` are null today: draw the picture with `next/image` `fill` in a box
  of `aspect-[var(--layer-photo-aspect,1/1)]`.
- Colours come from the theme variables of `styles/themes.css` (`var(--primary)`, `var(--border)`,
  `var(--muted-foreground)` and the rest) or the `ui-*` classes of the Medusa preset. No hex, `rgb()`,
  `hsl()`, `oklch()`, no `bg-white` or `text-black`.
- Shadows are `var(--shadow-card)`, `var(--shadow-float)`, `var(--shadow-modal)` or none. No `shadow-[…]`.
- Sizes and spacing come from the Tailwind scale, nothing under `text-xs`. Corners use
  `rounded-[var(--radius)]`, which follows the template's radius layer.
- The template layers are CSS variables on `<html>`. Read them with a fallback, so the block also works
  in a shop with no template:
  - `--layer-density` (a multiplier, 1) for the block's own vertical rhythm;
  - `--layer-section-gap` (3rem), which `BlockSection` already applies;
  - `--layer-photo-aspect` (1 / 1) for product and category pictures;
  - `--layer-button-bg`, `--layer-button-fg`, `--layer-button-border` for the primary button.
- Icons are `BlockIcon` (`shared/block-icon.tsx`), named by string from the closed list of
  `shared/icon-name.ts`, about 30 icons for delivery, payment, trust and the catalogue. A template's icon
  prop is parsed with `parseIcon`, which refuses any other name. An icon the list lacks is a question for
  the lead. `lucide-react` directly is allowed. The lint refuses `@medusajs/icons`, the storefront's
  own `modules/common/icons` and every other set inside `modules/blocks`.

## 4. Fixtures Feed the Playground

- `fixtures.empty` and `fixtures.sample` are props the parser accepts; `registry.test.ts` checks both.
- The playground `/<locale>/template-lab` answers 404 unless the server runs with
  `STOREFRONT_TEMPLATE_PREVIEW=1`. Every variant renders there on the shop's real catalogue under
  `#block-<category>-<variant>`, and a block with fixtures once more empty under `…-empty`.

## 5. Shots and Lint Prove the Block

- `pnpm template:shots --base http://localhost:8130 --locale en --host globex.shipshift.dev`, against a
  storefront started with the flag, writes PNGs at 360, 768 and 1280 px, an `index.html` contact sheet
  and two `contact-*.jpg` into `artifacts/templates/shots/<date>/`. `--baseline <dir>` adds a pixel diff.
- `pnpm lint:blocks` runs the design-docs ui-lint (19 detectors) over `src/modules/blocks`, plus the
  checks of section 3 it lacks. Any error or warning fails. It needs `~/upready/tools/ui-lint.js`, or
  `UI_LINT_PATH`. Without it the script exits 2, and that is not a pass.
- `pnpm template:check --base http://localhost:8130 --locale en --host globex.shipshift.dev` measures the
  rendered page against the 16.09 templates lab's quality rules (`QR-…`, `scripts/template-check/rules.mjs`):
  - the same storefront and flag as the shots, the same headless Chromium;
  - targets: every template's home, a category page and a product page, every playground anchor, at 360 and
    1280 px;
  - each rule keeps the lab's id, threshold and kind. A `gate` fails the run, a `report` only prints a number.
  - It writes `report.json` and `report.md` to `artifacts/templates/check/<date>/`.
  - It exits 1 only on a gate failure that `artifacts/templates/check/baseline.json` does not hold. The
    baseline is the debt the existing composition variants already had.
  - Check your own block or template with `--only <id>` (`--only hero/g`, `--only long-morning`).
  - Exit 2 means the stand, the playground or axe-core was missing, and that is not a pass.
  - Rewrite the baseline with `--write-baseline` only when a failure is fixed or accepted, never to hide a
    new one.
  - `node scripts/template-check.mjs --self-test` proves the measuring: a bad fixture fails every gate rule
    with its id, and a good one passes them all.

## 6. PR Checklist

- [ ] `<category>/<variant>/{index.tsx,props.ts,block.ts}` and one line in `<category>/index.ts`; nothing else
- [ ] `parseProps` built from `shared/parse.ts`, both fixtures, `roles`, `data`, `status: "lab"`
- [ ] every visible string a `LocalizedText` prop with Russian and English defaults; no `messages/*.json`
- [ ] wrapped in `BlockSection`; pictures as `ImageRef`, icons as `BlockIcon`
- [ ] `npx vitest run src/modules/blocks src/lib/templates page.baseline` passes
- [ ] `npx tsc --noEmit`, `pnpm lint` and `pnpm lint:blocks` pass
- [ ] `pnpm template:check --only <id>` is green, with no new failure against the baseline, and its
      `report.md` is linked in the PR body
- [ ] the contact sheet at 3 widths, live and empty, is linked in the PR body
- [ ] rebase on `origin/templates/main` right before the hand-in. A conflict in your category file means
  another block of your category landed, so keep both lines
- [ ] base `templates/main`, never `dev`

## 7. What Is Left to the Eyes

The machine catches a number with a threshold. It does not judge the following, so a person checks them on the
contact sheet, from the lab's §Checklist (`design/style-spec.md`):
- the three pages of a template read as one shop, and templates side by side read as one system;
- the difference between two templates can be named: palette, font, density, and nothing else;
- the first screen has one dominant, and the first product or catalogue entry is above the fold;
- a row of cards keeps titles and prices on one line, and a product is recognised by its picture;
- a card without a photo looks designed, not broken;
- the gallery is one frame with its thumbnails, and «add to cart» is the only primary action;
- no second accent colour, no gradients on controls, and the footer carries the page;
- the template has one device of its own that a token explains.

`QR-TECTONICS` and `QR-DENSITY` print their numbers, but the person decides.

## Template Contract

A template is `apps/storefront/src/templates/<id>/template.json`, schema
`upready.storefront-template/v1`, imported in `src/lib/templates/catalog.ts`. It holds these fields:

- `id` (kebab-case), `title` and `description`, English working text;
- `settings`, a `StorefrontSettingsInput`: the composition document `getEffectiveSettings()` answers
  today, checked by `validate()` of `lib/theme/composition.ts`, so `FORBIDDEN` refuses the template and
  `ADVISORY` warns;
- `theme`, the style layers, each mapped onto what already paints the page:

| Layer | Values | Lands on |
|---|---|---|
| `palette` | a preset of `THEME_IDS` or `LIGHT_ONLY_THEME_IDS`, or `default` | `data-theme` on `<html>` |
| mode | `settings.defaultMode` | `data-mode` on `<html>` |
| `radius` | `sharp`, `soft`, `round`, `pill` | the presets' own `--radius` |
| `buttonStyle` | `filled`, `outlined` | `--layer-button-*` |
| `photoStyle` | `square`, `portrait`, `landscape`, `wide` | `--layer-photo-aspect` |
| `density` | `compact`, `comfortable`, `spacious` | `--layer-density`, `--layer-section-gap` |
| `fontPair` | two of the twelve `FONT_NAMES` | `data-font-pair` on `<html>` when both have files, see below |

- `sections`, the home page in order: `{ "block": "<id>", "props"?: {…} }`, `home` blocks only. A hero,
  tiles or listing section is the page's own slot and matches `settings` (`hero/g` needs `"hero": "g"`);
  a slot `settings` turns on needs exactly one section. Header and footer come from `settings` alone.

`validateTemplate()` in `src/lib/templates/manifest.ts` checks all of it; `manifest.test.ts` runs it over
every template. `resolveTemplate()` turns a valid one into the settings, the two `<html>` attributes and
the inline CSS variables, the very inputs the storefront reads without a template.

The seven palettes of the 16.09 templates lab (`ferma`, `interier`, `katalog`, `lending`, `moda`, `opt`,
`uhod`) are `LIGHT_ONLY_THEME_IDS`: the lab drew no dark mode, so the build paints them light under both
`data-mode` values and no shop picker offers them. A template that names one sets `settings.defaultMode`
to `"light"`, and `validateTemplate()` refuses `"dark"` with it.

Fonts. The build profile's pair stays a `next/font` call generated at build time (`lib/theme/fonts.ts`). A
template's pair comes from `public/fonts/templates/`: the lab's Latin and Cyrillic woff2 of eight families
(`TEMPLATE_FONT_FAMILIES` in `lib/templates/fonts.ts`, licences in `LICENSES.md` beside the files). When both
families of `fontPair` are there, `resolveTemplate()` sets `fonts.pair` to `"<display>|<body>"` and
`fonts.loaded` to true, and the root layout writes `data-font-pair` on `<html>` and links
`/fonts/templates/fonts.css`. That sheet sets `--font-display` and `--font-body` and puts the page text and
the headings in them. DM Sans, Space Grotesk, Fraunces and Sora have no Cyrillic and no file, so a pair with
one of them keeps the build's type and `fonts.loaded` false. A page without a template links nothing.

The preview is `?template=<id>` on any page of a storefront started with `STOREFRONT_TEMPLATE_PREVIEW=1`.
It saves nothing. Without the flag every reader returns early, and `page.baseline.test.tsx` holds the
home page to the tree it had before templates existed.
