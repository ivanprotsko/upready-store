# tariffs — "Тарифы"

What it is: a billing-period control and three plan cards — Бесплатный, Про
(699 ₽ per month, or 5 499 ₽ per year = 458 ₽ per month), Ультра (4 499 ₽ per
month). Each card carries five values and a button that enters the funnel with
that plan already chosen. Spec: t-2026-09-14-01 (Ivan's order of 2026-09-14,
plus his eleven-point revision the same night); the previous naming
(Бесплатный / Бизнес / Про, t-2026-09-13-02) was renamed, monthly prices
unchanged.

Copy source: Ivan's order, recorded verbatim in `HANDOFF.json` under
t-2026-09-14-01. The feature inventory is
`artifacts/docs/2026-09-13-pricing-features-inventory.md`.

What a reviewer must know:

- **No row labels, no divider lines.** The cards used to carry a left-hand
  column of row names (Товаров, Дизайн, Поддержка, Языки витрины, Telegram Mini
  App). They are gone; every value now reads on its own ("15 товаров", not
  "15"). The hairline between rows is gone too (revision §4), so the comparison
  rests on position alone: the five values stand in the same order in every card
  and one-for-one at the same height. That height is a measurement, not a hope:
  `accept-homepage.mjs` compares the tops of the five rows across the three
  cards at 1440 and fails when they drift apart. Between 961 and 1140px a long
  value wraps to two lines, so `.row` reserves two lines there and the price
  drops to 28px (the word "Бесплатно" is wider than the old "0 ₽" and pushed the
  period label onto a second line); below 960px the cards stack and there is
  nothing to align.
- **Billing period control** (revision §2/§3). A segmented control above the
  cards switches between "Оплата за год" (default) and "За месяц". In the annual
  mode the big figure stays a per-month figure so the three plans compare in one
  unit, and the line under it names what is actually charged: "при оплате за год
  — 5 499 ₽". The control lives on the page only — the demo checkout knows
  nothing about billing periods, so `p=` parameters do not change with it.
- **Ультра has no annual price.** 5 499 ₽ is the only annual price Ivan has
  given. In the annual mode Ультра therefore keeps its monthly price and says
  "годовая цена пока не назначена" — an honest gap, not an invented figure
  (rule 17a). One line in `data.ts` closes it once Ivan names the number.
- **Hints instead of footnotes** (revision §5/§6). Every value is underlined
  with a dashed rule and explains itself on hover, keyboard focus or tap
  (`:focus-within`, `tabIndex={0}`); the block of footnotes under the cards is
  gone, and what was a footnote now lives in the hint of the value it belongs
  to. Three superscript markers remain as a sign that a condition exists, one
  per card: ¹ Telegram Mini App (Бесплатный), ² the trial (Про), ³ the catalogue
  (Ультра). The acceptance script hovers the markers and reads the tooltip that
  actually becomes visible — the text being present in the DOM proves nothing.
- **Trial period.** Про carries "7 дней бесплатно ²" in the top-right corner of
  the card, and the condition in full in its hint: the period starts once the
  card is linked, and the charge happens automatically at the end unless the
  subscription is cancelled. (The hint says "спишем оплату", not a figure,
  because the figure now depends on the chosen period.) This is page copy and a
  recorded decision only — no billing provider is wired. Verified 2026-09-14
  from primary sources that both candidate providers support exactly this
  scheme: Polar (polar.sh/docs/features/subscriptions/trials) and Tribute
  (wiki.tribute.tg/for-content-creators/subscriptions/trial-subscription-period,
  which offers 3 or 7 days among its fixed lengths). Choosing a provider and
  wiring billing is a separate task.
- **The unlimited catalogue.** Ультра says "Неограниченное количество товаров"
  with marker ³; the hint states that 500 products are included and every
  further product is paid for separately. The price of a further product comes
  from t-2026-09-14-02 (cost calculator). Until that number is measured there,
  the hint carries no price at all — a made up figure would be an invention
  (rule 17a), and `accept-homepage.mjs` fails on placeholder shapes such as
  "N ₽" or "TBD".
- **Funnel parameters.** Each button resolves through
  `funnelUrl(PLAN_SCENARIOS[...])`, giving `plan-cta-free`, `plan-cta-pro` and
  `plan-cta-ultra`. The `p=` parameters were renamed together with the plans to
  `store-free`, `store-pro`, `store-ultra`. Why, in full, in `src/lib/funnel.ts`:
  the demo checkout still knows store-start 4 900, store-business 9 900 and
  store-pro 19 900 "разово", so none of its three prices matched any price on
  this page in the first place, and unknown ids fail loudly in `resolvePlan`
  instead of quietly showing a stranger's price. Bringing the checkout to these
  three plans — and teaching it the billing period — is inventory §5/§6.
- **Assumptions Ivan has not ruled on** (inventory §2): one storefront language
  in Бесплатный, two language versions in Про (his revision §7), any number in
  Ультра; the wording of the fifteen hints is mine — it explains the value, it
  does not add product mechanics.
- Three columns become one below 960px.
