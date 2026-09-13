# words — "Три слова на деле"

What it is: three columns, one per headline noun, each holding the word, its
territory in small type, and three single-line proofs.

Copy source: concept §3 "Три слова на деле", verbatim; markup and CSS from the
prototype's `.three` block. Nothing here is generated or paraphrased.

What a reviewer must know:

- The section is new in this rework. It replaces the removed "Почему это про
  вас" pair and the "Что входит" list.
- DOM id is `sec-words`; no nav link points at it, the id exists for
  `?section=words` parity and for deep links.
- The eyebrow and the heading use the global `.eyebrow` / `.head` utilities
  from `src/styles/base.css`, the same ones every other section uses.
- The three columns collapse to one below 1024px, matching the prototype.
- Column claims are backed by the honesty table in concept §6. Three of them
  ("сотни вариантов блоков", "фразой в чате", "генерация изображений") are
  marked there as living in neighbouring repositories, not yet in
  upready-store. Changing that status is a copy decision for Ivan, not a code
  change here.
