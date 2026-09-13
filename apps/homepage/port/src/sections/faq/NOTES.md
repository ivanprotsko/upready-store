# faq — "Вопросы"

What it is: five questions on native `<details>` elements, the first one open.

Copy source: concept §3 "Вопросы", verbatim. The answers were rewritten for
this page; the old FAQ's `todo:` badges and its payment-method claims are gone.

What a reviewer must know:

- `<details>` is uncontrolled here. React sets `open` on the first item and then
  the browser owns the state, so the section keeps working without JavaScript
  and without any page-level state.
- The `+` / `–` marker is a pseudo-element. The native triangle is removed twice
  over, once for Firefox (`list-style: none`) and once for WebKit
  (`::-webkit-details-marker`); dropping either brings the triangle back in one
  browser only.
- "Что с оплатой?" describes the intended model. Concept §6 records that no
  payment provider is integrated yet, and §7 item 2 leaves the wording to Ivan.
- The section has no CTA, matching the prototype.
- `sec-faq` is a nav anchor. Renaming the id breaks the header link.
