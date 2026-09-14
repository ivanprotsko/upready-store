# tariffs — "Тарифы"

What it is: a billing-period control and three plan cards — Новичок, Профи
(699 ₽ per month, or 5 499 ₽ per year = 458 ₽ per month), Мастер (4 499 ₽ per
month). Each card carries five values and a button that enters the funnel with
that plan already chosen. Spec: t-2026-09-14-01 (Ivan's order of 2026-09-14 and
his two rounds of revisions the same night).

The names changed twice in one night: Бесплатный/Бизнес/Про (t-2026-09-13-02) →
Бесплатный/Про/Ультра → Новичок/Профи/Мастер. The plan KEYS (`free`, `pro`,
`ultra`) did not move with them — they are the funnel scenario keys, and an
address that follows marketing copy breaks on the next rename.

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
  unit, and the line under it reads "при оплате за год" — Ivan's decision of
  2026-09-14: the figure above IS the price under annual billing, and the yearly
  sum is not repeated on the card (5 499 ₽ for Профи stays in the inventory).
  The control lives on the page only — the demo checkout knows nothing about
  billing periods, so `p=` parameters do not change with it.
- **Мастер shows the same 4 499 ₽ in both modes.** Ivan never named an annual
  price for it, and under his ruling the annual card now presents 4 499 ₽ as the
  annual-billing price. So switching the control changes nothing for Мастер —
  that is his decision, recorded here because the cost calculator
  (t-2026-09-14-02) may contradict it.
- **Hints instead of footnotes** (revision §5/§6). Every value is underlined
  with a dashed rule and explains itself on hover, keyboard focus or tap
  (`:focus-within`, `tabIndex={0}`); the block of footnotes under the cards is
  gone, and what was a footnote now lives in the hint of the value it belongs
  to. Four superscript markers remain as a sign that a condition exists, in
  reading order: ¹ Telegram Mini App (Новичок), ² the trial (Профи), ³ the trial
  (Мастер), ⁴ the catalogue (Мастер). A marker stands OUTSIDE the dashed
  underline (`.marked` wraps `.hint` plus the `sup`): the dash promises a hint,
  the marker means a condition, and underlining both mixes two signs into one —
  the acceptance script measures `text-decoration-line` on the marker's parent.
  The script also hovers the triggers and reads the tooltip that actually
  becomes visible — the text being present in the DOM proves nothing.
- **Trial periods.** Профи carries "3 дня бесплатно ²" and Мастер "7 дней
  бесплатно ³" in the top-right corner of the card, each with the condition in
  full in its hint: the period starts once the card is linked, and the charge
  happens automatically at the end unless the subscription is cancelled. (The
  hint says "спишем оплату", not a figure, because the figure now depends on the
  chosen period.) This is page copy and a recorded decision only — no billing
  provider is wired. Verified 2026-09-14 from primary sources that both candidate providers support exactly this
  scheme: Polar (polar.sh/docs/features/subscriptions/trials) and Tribute
  (wiki.tribute.tg/for-content-creators/subscriptions/trial-subscription-period,
  which offers 3 or 7 days among its fixed lengths). Choosing a provider and
  wiring billing is a separate task.
- **The unlimited catalogue.** Мастер says "Неограниченное количество товаров"
  with marker ⁴; the hint states that 500 products are included and every
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
- **Buttons** (revision round 2, §4): "Создать магазин" on Новичок,
  "Попробовать бесплатно" on both paid plans — the paid buttons now promise the
  trial, not the plan name.
- **Assumptions Ivan has not ruled on** (inventory §2): one storefront language
  in Новичок, two language versions in Профи, any number in Мастер; the wording
  of the fifteen hints is mine — it explains the value, it does not add product
  mechanics.
- Three columns become one below 960px.
