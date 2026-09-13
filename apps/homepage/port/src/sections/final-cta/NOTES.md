# final-cta — closing block

What it is: the last call to action, centred, with a Telegram link beside it
for anyone who would rather ask first.

Copy source: concept §3 "Финал", verbatim.

What a reviewer must know:

- The button is `final-cta` and resolves through `funnelUrl(HERO_SCENARIO)`, the
  same destination as the hero and nav buttons.
- DOM id is `start`, kept from the prototype. Nothing links to it today; it
  exists so a campaign can deep-link to the closing block.
- The Telegram address `https://t.me/vladupready` appears twice on the page,
  here and in the footer. Both come from the concept, and both open in a new
  tab with `rel="noopener"`.
- The section reuses the global `.sub` utility but overrides its top margin and
  left alignment, because this block is centred and the utility is not.
- It prints no page-wide ordinal, so it ignores the `num` prop.
