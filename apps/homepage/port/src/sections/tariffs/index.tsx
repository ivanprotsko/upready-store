import { useState } from "react";

import { PLAN_SCENARIOS, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import {
  BILLING_OPTIONS,
  DEFAULT_BILLING,
  EYEBROW,
  HEADING,
  PLANS,
  type BillingPeriod,
  type PlanValue,
} from "./data";

/**
 * «Тарифы»: переключатель периода оплаты и три карточки, кнопка каждой ведёт в
 * воронку с уже выбранным тарифом (концепция §2, строка «воронка с выбранным
 * тарифом»). Спецификация планов — t-2026-09-14-01.
 *
 * Подписей строк слева нет и разделительных линий между строками нет:
 * значения самоописывающие, а сравнение держится на позиции — пять строк в
 * одном порядке у всех трёх карточек и одинаковая высота строки (styles
 * `.row`), чтобы одноимённые строки соседних карточек стояли на одной высоте.
 * Что значит значение, говорит подсказка по наведению; подчёркивание пунктиром
 * — обещание, что подсказка есть.
 */
function Hint({ text, note, hint }: PlanValue) {
  return (
    // tabIndex — чтобы подсказка открывалась не только мышью: `:focus-within`
    // в CSS раскрывает её с клавиатуры и по тапу на узком экране.
    <span className={styles.hint} tabIndex={0}>
      {text}
      {note ? <sup>{note}</sup> : null}
      <span className={styles.tip} role="tooltip">
        {hint}
      </span>
    </span>
  );
}

export default function Tariffs() {
  const [billing, setBilling] = useState<BillingPeriod>(DEFAULT_BILLING);

  return (
    <section
      id="sec-tariffs"
      data-section="tariffs"
      data-testid="sec-tariffs"
      className={styles.section}
    >
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>

      <div className={styles.billing} role="group" aria-label="Период оплаты" data-testid="billing">
        {BILLING_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={styles.billingBtn}
            data-active={billing === option.key}
            aria-pressed={billing === option.key}
            onClick={() => setBilling(option.key)}
            data-testid={`billing-${option.key}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={styles.plans}>
        {PLANS.map((plan) => {
          const scenario = PLAN_SCENARIOS[plan.scenario];
          const price = plan.prices[billing];
          return (
            <div key={plan.scenario} className={styles.plan} data-testid={`plan-${plan.scenario}`}>
              <div className={styles.planHead}>
                <span className="eyebrow" data-testid={`plan-name-${plan.scenario}`}>
                  {plan.name}
                </span>
                {plan.trial ? (
                  <span
                    className={`${styles.hint} ${styles.trial}`}
                    tabIndex={0}
                    data-testid={`plan-trial-${plan.scenario}`}
                  >
                    {plan.trial.lead}
                    <sup>{plan.trial.note}</sup>
                    <span className={`${styles.tip} ${styles.tipRight}`} role="tooltip">
                      {plan.trial.text}
                    </span>
                  </span>
                ) : null}
              </div>

              <div className={styles.price} data-testid={`plan-price-${plan.scenario}`}>
                {price.amount}
                <small>{price.period}</small>
              </div>
              {/* Строка под ценой одной высоты у всех карточек, иначе строки
                  сравнения разъедутся по высоте. */}
              <p className={styles.priceNote} data-testid={`plan-price-note-${plan.scenario}`}>
                {price.note || " "}
              </p>

              <ul className={styles.rows}>
                {plan.values.map((value) => (
                  <li key={value.text} className={styles.row}>
                    <Hint {...value} />
                  </li>
                ))}
              </ul>

              <a
                className={`btn ${styles.planCta}`}
                href={funnelUrl(scenario)}
                title={scenario.title}
                data-testid={`plan-cta-${plan.scenario}`}
              >
                {plan.cta}
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
