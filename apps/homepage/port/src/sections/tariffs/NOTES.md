# tariffs — "Тарифы"

What it is: three plan cards — Бесплатный, Про (699 ₽ per month or 5 499 ₽ per
year), Ультра (4 499 ₽ per month). Each card carries five values and a button
that enters the funnel with that plan already chosen. Spec: t-2026-09-14-01
(Ivan's order of 2026-09-14); the previous naming (Бесплатный / Бизнес / Про,
t-2026-09-13-02) was renamed, prices and periods unchanged.

Copy source: Ivan's order, recorded verbatim in `HANDOFF.json` under
t-2026-09-14-01. The feature inventory is
`artifacts/docs/2026-09-13-pricing-features-inventory.md`.

What a reviewer must know:

- **No row labels.** The cards used to carry a left-hand column of row names
  (Товаров, Дизайн, Поддержка, Языки витрины, Telegram Mini App). They are gone;
  every value now reads on its own ("15 товаров", not "15"). The cards still
  read as a comparison because the five values stand in the same order in every
  card and one-for-one at the same height. That height is a measurement, not a
  hope: `accept-homepage.mjs` compares the tops of the five rows across the
  three cards at 1440 and fails when they drift apart. Between 961 and 1140px a
  long value wraps to two lines, so `.row` reserves two lines there; below 960px
  the cards stack and there is nothing to align.
- **Trial period.** Про carries "7 дней бесплатно" plus the condition in full:
  the period starts once the card is linked, and 699 ₽ is charged automatically
  at the end unless the subscription is cancelled. This is page copy and a
  recorded decision only — no billing provider is wired. Verified 2026-09-14
  from primary sources that both candidate providers support exactly this
  scheme: Polar (polar.sh/docs/features/subscriptions/trials) and Tribute
  (wiki.tribute.tg/for-content-creators/subscriptions/trial-subscription-period,
  which offers 3 or 7 days among its fixed lengths). Choosing a provider and
  wiring billing is a separate task.
- **Footnote on the unlimited catalogue.** Ультра says "Неограниченное
  количество товаров" with a footnote marker; the footnote states that 500
  products are included and every further product is paid for separately. The
  price of a further product comes from t-2026-09-14-02 (cost calculator). Until
  that number is measured there, the footnote carries no price at all — a made
  up figure would be an invention (rule 17a), and `accept-homepage.mjs` fails on
  placeholder shapes such as "N ₽" or "TBD".
- **Funnel parameters.** Each button resolves through
  `funnelUrl(PLAN_SCENARIOS[...])`, giving `plan-cta-free`, `plan-cta-pro` and
  `plan-cta-ultra`. The `p=` parameters were renamed together with the plans to
  `store-free`, `store-pro`, `store-ultra`. Why, in full, in `src/lib/funnel.ts`:
  the demo checkout still knows store-start 4 900, store-business 9 900 and
  store-pro 19 900 "разово", so none of its three prices matched any price on
  this page in the first place, and unknown ids fail loudly in `resolvePlan`
  instead of quietly showing a stranger's price. Bringing the checkout to these
  three plans is inventory §5.
- **Assumptions Ivan has not ruled on** (inventory §2): one storefront language
  in Бесплатный and Про; no annual price for Ультра, so that card has no second
  price line.
- Three columns become one below 960px.
