# tariffs — "Тарифы"

What it is: two plans, Старт and Бизнес, each with its price, a one-line
summary and a button that enters the checkout with that plan already chosen.
Below them, one line about the Про plan, which is sold in the checkout only.

Copy source: concept §3 "Тарифы". The summaries are quoted from the funnel
catalogue (`apps/storefront/src/lib/demo/catalog.ts`), so the page and the
checkout say the same thing.

What a reviewer must know:

- Each button resolves through `funnelUrl(PLAN_SCENARIOS[...])`, giving
  `plan-cta-start` and `plan-cta-business`. They skip the plan picker and go
  straight to the pay screen.
- "Разово" is a decision, not a measurement: the checkout never states a
  period, and concept §7 item 1 keeps the wording the old page used. If Ivan
  decides otherwise, this is the one word to change.
- "Приём платежей" in the Бизнес summary comes from the checkout catalogue, and
  concept §6 marks it as having no payment provider behind it yet. That is a
  copy decision for Ivan, recorded in §7 item 2.
- Prices are quoted in demo rubles from the same catalogue. Nothing on this
  page computes or formats them.
- Two columns become one below 768px.
