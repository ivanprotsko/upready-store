# how — "Как это работает"

What it is: the three wizard screens a new owner walks through, plus one line
about what happens after the storefront opens.

Copy source: concept §3 "Как это работает", verbatim. The three screens match
the real wizard (`start/onboarding/wizard.tsx` in the funnel branch): name and
address, owner credentials, theme.

What a reviewer must know:

- Step numbers come from a CSS counter, not from the markup. Reordering the
  steps in `data.ts` renumbers them automatically.
- This section prints no page-wide ordinal, so it ignores the `num` prop the
  registry may pass. Same for every other new section.
- "Семь тем, светлая или тёмная" is backed: themes were accepted on the stand
  in wave 6 (concept §6).
- The section carries no CTA of its own. Concept §2 gives the funnel button to
  the hero, the nav, "Почему сейчас", the tariffs and the final block; adding a
  sixth one here would be a copy change, not a styling one.
- Three cards collapse to one column below 1024px, matching the prototype.
