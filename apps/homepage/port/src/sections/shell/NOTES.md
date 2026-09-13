# shell — page chrome (Nav + Footer)

What it is: the sticky header's navigation and the page footer. Not a layout
block: `src/config/layout.ts` keeps `shell` in `CHROME_SLUGS`, so edit mode can
neither hide nor move it.

Copy source: prototype `artifacts/docs/2026-09-13-homepage-prototype.html`
lines 219-225 (nav) and 396 (footer); concept §3 "Шапка" and "Подвал".

What a reviewer must know:

- `Nav` takes no props any more. The old `showIncluded` / `showPricing` /
  `showFaq` flags went away with the sections they pointed at.
- The three text links are hidden below 768px by their own `.navLink` class,
  not by `:not(.btn)`: `.btn` is a global class from `base.css`, and inside a
  CSS module that selector would need `:global(...)`.
- The nav button is the page's `nav-cta` and resolves through `funnelUrl()`,
  the same scenario as the hero CTA.
- Footer holds exactly two items. Every `todo:` badge, the legal placeholders
  and the draft stamp are gone (concept §3: no placeholder text on the page).
- The footer draws its own top border; `App.module.css` removes the border from
  whichever block ends up first in the container.
