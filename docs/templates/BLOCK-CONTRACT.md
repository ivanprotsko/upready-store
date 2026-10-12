# Block Contract

One block variant lands in one PR, on a `templates/*` branch, against `templates/main`, never `dev`. A
template is a manifest over the storefront's existing composition, so a block is a component plus a
registry entry, and you never add a second theming path.

## 1. One Folder and One Registry Line Make a Block

Put the block in `apps/storefront/src/modules/blocks/<category>/<variant>/`, kebab-case:

- `index.tsx` holds the component, a server component unless it needs state.
- `props.ts` holds the props type and its parser.
- `block.ts` holds the registry entry, a `BlockEntry` from `modules/blocks/types.ts`.

Add one import and one array item to `modules/blocks/registry.ts`. The entry carries these fields:

| Field | What you write |
|---|---|
| `id` | `<category>/<variant>`, the name a template uses |
| `category`, `variant` | the two halves of the id |
| `title` | an English working name for the playground and the contact sheet |
| `roles` | what it draws: `heading`, `cta-primary`, `product-card`, `promo-text` and the rest of `BlockRole` |
| `data` | where its content comes from: `products`, `categories`, `shop`, `profile`, `static` |
| `status` | `lab` for a new block, `live` once the composition contract and the panel know it |
| `placement` | `home` for a home section; `site` is reserved for header and footer |
| `parseProps`, `fixtures` | see sections 2 and 4 |

The composition variants (header h1 to h6, hero g h j k l m ga gb, tiles, listing p1 to p5, footer f1
to f7) are registered by reference in `modules/blocks/existing.ts`. Never move or copy one. Its entry
points at the live registry's own component, and `registry.test.ts` fails when a composition key has
no entry or the entry points elsewhere.

## 2. Props Are Typed and Parsed, Data Comes Through a Loader

- Type the props in `props.ts`. `parseProps(input)` returns `{ ok: true, value }` or `{ ok: false, errors }`.
  The template validator calls it for every section of the block, absent props included.
- Shop text arrives as `{ "<locale>": "…" }` keyed by the codes of `src/i18n/config.ts`. Pick the
  visitor's language, then English, then any.
- The block's own chrome, such as a button label, is a next-intl key in all 36 catalogs. Never a literal.
- Catalogue data is read through a `"use server"` loader in `src/lib/data`, never a fetch in the
  component. List what it reads in `data`.
- With nothing to show, the block renders `null`. An empty frame is not an empty state.

## 3. Tokens Only

- Colours come from the theme variables of `styles/themes.css` (`var(--primary)`, `var(--border)`,
  `var(--muted-foreground)` and the rest) or the `ui-*` classes of the Medusa preset. No hex, `rgb()`,
  `hsl()`, `oklch()`, no `bg-white` or `text-black`.
- Shadows are `var(--shadow-card)`, `var(--shadow-float)`, `var(--shadow-modal)` or none. No `shadow-[…]`.
- Sizes and spacing come from the Tailwind scale, nothing under `text-xs`. Corners use
  `rounded-[var(--radius)]`, which follows the template's radius layer.
- The template layers are CSS variables on `<html>`. Read them with a fallback, so the block also works
  in a shop with no template:
  - `--layer-density` (a multiplier, 1) for the block's own vertical rhythm;
  - `--layer-section-gap` (3rem) for the space around a home section;
  - `--layer-photo-aspect` (1 / 1) for product and category pictures;
  - `--layer-button-bg`, `--layer-button-fg`, `--layer-button-border` for the primary button.
- Icons are `lucide-react` only. The storefront does not depend on it yet, so the first block that needs
  an icon adds it in its own PR. The lint refuses `@medusajs/icons` inside `modules/blocks`.

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

## 6. PR Checklist

- [ ] `<category>/<variant>/{index.tsx,props.ts,block.ts}` and one line in `registry.ts`
- [ ] `parseProps`, both fixtures, `roles`, `data`, `status: "lab"`
- [ ] `npx vitest run src/modules/blocks src/lib/templates page.baseline` passes
- [ ] `npx tsc --noEmit`, `pnpm lint` and `pnpm lint:blocks` pass
- [ ] the contact sheet at 3 widths, live and empty, is linked in the PR body
- [ ] base `templates/main`, never `dev`

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
| `palette` | a preset of `THEME_IDS`, or `default` | `data-theme` on `<html>` |
| mode | `settings.defaultMode` | `data-mode` on `<html>` |
| `radius` | `sharp`, `soft`, `round`, `pill` | the presets' own `--radius` |
| `buttonStyle` | `filled`, `outlined` | `--layer-button-*` |
| `photoStyle` | `square`, `portrait`, `landscape`, `wide` | `--layer-photo-aspect` |
| `density` | `compact`, `comfortable`, `spacious` | `--layer-density`, `--layer-section-gap` |
| `fontPair` | two of the twelve `FONT_NAMES` | build time only, see below |

- `sections`, the home page in order: `{ "block": "<id>", "props"?: {…} }`, `home` blocks only. A hero,
  tiles or listing section is the page's own slot and matches `settings` (`hero/g` needs `"hero": "g"`);
  a slot `settings` turns on needs exactly one section. Header and footer come from `settings` alone.

`validateTemplate()` in `src/lib/templates/manifest.ts` checks all of it; `manifest.test.ts` runs it over
every template. `resolveTemplate()` turns a valid one into the settings, the two `<html>` attributes and
the inline CSS variables, the very inputs the storefront reads without a template.

Fonts are `next/font` calls generated at build time for the active profile only (`lib/theme/fonts.ts`),
so a preview shows the build's own pair; `ResolvedTemplate.fonts.loaded` says whether it is the template's.

The preview is `?template=<id>` on any page of a storefront started with `STOREFRONT_TEMPLATE_PREVIEW=1`.
It saves nothing. Without the flag every reader returns early, and `page.baseline.test.tsx` holds the
home page to the tree it had before templates existed.
