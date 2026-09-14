import { useState } from "react";

import { ONBOARDING_SCENARIO, funnelUrl, telegramPlanUrl } from "../../lib/funnel";
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
 * «Тарифы»: переключатель периода оплаты и три карточки. Кнопки ведут в разные
 * места — решение Ивана от 2026-09-14 (t-2026-09-13-02):
 *
 *   • бесплатный тариф → мастер онбординга, магазин создаётся сразу и
 *     бесплатно, платить нечем и незачем;
 *   • платные → телеграм-бот с номером тарифа в диплинке; бот показывает, что
 *     входит в тариф, и принимает оплату.
 *
 * Ссылка в бот уходит НАРУЖУ (target="_blank"), мастер — на свой домен, в той
 * же вкладке: пользователь, который пошёл создавать магазин, не должен
 * возвращаться к прайсу через историю браузера.
 *
 * Спецификация планов — t-2026-09-14-01.
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
    // Верхний индекс стоит СНАРУЖИ подчёркнутой области: пунктир обещает
    // подсказку у самого значения, а маркер сноски — знак другого рода, и
    // подчёркивать его вместе с текстом значит смешивать два знака в один.
    // tabIndex — чтобы подсказка открывалась не только мышью: `:focus-within`
    // в CSS раскрывает её с клавиатуры и по тапу на узком экране.
    <span className={styles.marked}>
      <span className={styles.hint} tabIndex={0}>
        {text}
        <span className={styles.tip} role="tooltip">
          {hint}
        </span>
      </span>
      {note ? <sup className={styles.mark}>{note}</sup> : null}
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
        {PLANS.map((plan, index) => {
          // Номер в диплинке — ПОРЯДОК КАРТОЧКИ (1 — первая), а не ключ плана:
          // имена и ключи тарифов менялись дважды за сутки, порядок «от дешёвой
          // к дорогой» — ни разу, и боту достаточно знать, какой из трёх выбран.
          const free = plan.scenario === "free";
          const href = free ? funnelUrl(ONBOARDING_SCENARIO) : telegramPlanUrl(index + 1);
          const title = free
            ? ONBOARDING_SCENARIO.title
            : `Тариф «${plan.name}» — бот расскажет, что входит, и примет оплату`;
          const price = plan.prices[billing];
          return (
            <div key={plan.scenario} className={styles.plan} data-testid={`plan-${plan.scenario}`}>
              <div className={styles.planHead}>
                <span className="eyebrow" data-testid={`plan-name-${plan.scenario}`}>
                  {plan.name}
                </span>
                {plan.trial ? (
                  <span
                    className={`${styles.marked} ${styles.trial}`}
                    data-testid={`plan-trial-${plan.scenario}`}
                  >
                    <span className={styles.hint} tabIndex={0}>
                      {plan.trial.lead}
                      <span className={`${styles.tip} ${styles.tipRight}`} role="tooltip">
                        {plan.trial.text}
                      </span>
                    </span>
                    <sup className={styles.mark}>{plan.trial.note}</sup>
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
                href={href}
                title={title}
                data-testid={`plan-cta-${plan.scenario}`}
                {...(free ? {} : { target: "_blank", rel: "noopener noreferrer" })}
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
