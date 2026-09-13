# hero — first screen with the cycling headline

What it is: the H1 whose three nouns light up in turn, the lead, the funnel
CTA, and the panel on the right whose caption and illustration follow the lit
word.

Copy source: concept §3 "Герой" (lead, CTA, micro line) and §4 (mechanics);
markup and CSS ported from the prototype, variant A of its script. Audience
variants (cold / warm / price) are gone: one page, one message (concept §2).

What a reviewer must know:

- Between «и» and «независимость» sits a real U+00A0, written in `data.ts` as the
  escape `\u00A0`. An HTML entity does not expand inside a JSX string.
- `prefers-reduced-motion` is read synchronously in the state initializer, so
  there is no frame in which a reduced-motion visitor sees the cycle start.
- Hover and keyboard focus pin a word and stop the cycle; leaving resumes it.
  A click pins until the next click, which is the touch path (no hover there).
- The hero must not change height when the word changes: the caption keeps a
  `min-height` (2.6em, 4em below 768px) and all three illustrations are stacked
  inside one `aspect-ratio` stage.
- Timers: the word cycle and the mini-store's look cycle are cleared on unmount
  and whenever reduced motion flips.
- The acceptance script reads `[data-hero-word][data-on]` and the stage's
  `data-ill-index`. Renaming those attributes breaks `scripts/accept-homepage.mjs`.
- Numbers inside the illustrations are made up, which is why two of them carry a
  «пример» label, as the illustration brief (concept §5) asks.
