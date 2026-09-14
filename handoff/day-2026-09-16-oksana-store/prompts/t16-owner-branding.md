# Goal

Let a shop owner make the storefront look like their brand: a logo, a favicon, a primary colour, and the picture
that shows up when someone shares a link.

Today the owner can pick one of seven theme presets and nothing else
(`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Темы и дизайн», §6 gap 9): no logo upload, no
colours, no fonts, no favicon, and the og image is one shared picture for every shop on the platform. InSales
ships a template palette editor and even a logo generator (`insales-combo-features.md`, ids
`palitra-tsvetov-shablona`, `generator-logotipov`).

For this client it is agreed work: a single brand identity was promised as part of the deal, and a footer credit
line «Создание сайта — Иван Процко» was agreed explicitly
(`{{MISSION_DIR}}/research/telegram-digest.md`, #469140, #469345).

## Step plan

1. **Brand fields on the tenant**, served with the rest of the tenant document through `/storefront/by-host` so
   the storefront gets them on the very first render with no extra round trip: logo (light and dark variants,
   both optional), favicon, og image, primary colour, and a short shop name for the header when there is no
   logo.
2. **Upload through the existing tenant upload route** (`apps/backend/src/tenant-files/`, public URLs from
   `LOCAL_FILE_BACKEND_URL`), with a size limit, an accepted-type list (SVG, PNG, WebP; validate SVG content or
   rasterise it rather than serving arbitrary markup), and an image-dimension check with a clear message.
3. **Storefront.** The header shows the logo at a sensible height in both light and dark mode; the favicon and
   the web-app icons come from the tenant, not from the build; `openGraph` and `twitter` metadata use the
   tenant's og image with the shop's name; the primary colour feeds the existing theme tokens rather than a new
   parallel system (`lib/theme/presets.generated.ts` and the `data-theme`/`data-mode` attributes on `<html>`).
   A shop that has set nothing looks exactly as it does today.
4. **Colour must stay readable.** Check the contrast of text on the chosen colour and warn the owner in the
   panel when it fails, instead of shipping unreadable buttons. Do not silently override their choice.
5. **Panel screen** in home settings or settings: upload, preview on a miniature of the header, colour picker
   with the warning, and a reset to the preset default.
6. **Footer credit.** A per-tenant footer line with text and an optional link, off by default, on for this
   client. It is a field, not a hardcoded string.
7. **Caching.** A changed logo must appear without a rebuild, through the existing revalidation path, and the
   favicon must not be cached forever under the old bytes: version the URL.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- The owner uploads a logo and a favicon and sets a colour; the storefront header, the browser tab and a primary
  button all change. Screenshots at 1280x900 and 390x844, in light AND in dark mode — a measurement in one mode
  says nothing about the other, and compare the frames above the fold, not the tokens.
- `curl -s <shop url> | grep -i 'og:image'` returns the tenant's own image; a second shop returns its own or the
  default. Quote both.
- A low-contrast colour raises the warning in the panel. Screenshot.
- A shop that set nothing renders byte-identically to before the change on its home page above the fold.
  Screenshot pair.
- Suites pass; quote whole-file result lines.

## What NOT to do

- Do not add font uploads or a full CSS editor: four fields, done properly.
- Do not serve uploaded SVG without validating it.
- Do not hardcode the client's brand or the credit line anywhere in product code.
- Do not deploy.
