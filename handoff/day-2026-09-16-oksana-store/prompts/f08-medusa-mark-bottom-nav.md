# Goal

The middle button of the mobile bottom navigation of Оксана's shop is the Medusa logo.

Measured live (QA q01, `https://cherkashino.shipshift.dev/ru` at 390×844, 2026-09-15): the fixed bottom bar
holds five controls and the central one loads `https://cherkashino.shipshift.dev/medusa.svg` — screenshot
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/12-home-bottomnav-390x844.png`. In the source it is explicit:

```
apps/storefront/src/modules/layout/components/bottom-nav/index.tsx
36:  <Link href="/" aria-label={siteName} data-testid="bottom-nav-store-link">
37:    <Image src="/medusa.svg" alt="" width={24} height={26} priority />
```

It is the home button, in the most prominent position of the navigation a phone buyer uses on every page, and
it carries the engine's brand instead of the shop's. This is the ticket the capabilities research already
called out as `t-2026-09-12-medusa-mark-bottom-nav`
(`{{MISSION_DIR}}/research/upready-store-capabilities.md`, row «Витрина как таковая»).

## What to do

Replace it with the shop's own mark, resolved the way the header already resolves one: the tenant's logo when
it has one, otherwise a neutral glyph (a house, or the shop's initials) — never a third party's logo. The nav
header already reads the tenant's name and settings (`apps/storefront/src/modules/layout/templates/nav/**`),
so take the same source rather than adding a second one. `aria-label={siteName}` is already right, keep it.

Check the rest of the storefront for the same file: `git grep -n "medusa.svg" apps/storefront` — fix every
occurrence, not the one you were shown (rule 20). Do not delete the file from `public/` in this task if the
single-store starter still uses it; say what you found.

## Acceptance (measure — rule 18f)

1. At 390×844 on `https://cherkashino.shipshift.dev/ru`, the bottom bar contains no request for `medusa.svg` —
   paste the network check (`page.on('request')` or the DOM `img` list);
2. the central control still navigates to the shop's home page and keeps its accessible name;
3. screenshots at 390×844 of the home page, a product page and the cart with the new mark;
4. `git grep -n "medusa.svg" apps/storefront` output pasted, with a line on each remaining hit.
