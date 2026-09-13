import { PLAN_SCENARIOS, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { EYEBROW, FOOTNOTES, HEADING, PLANS } from "./data";

/**
 * «Тарифы»: три карточки, кнопка каждой ведёт в воронку с уже выбранным
 * тарифом (концепция §2, строка «воронка с выбранным тарифом»). Спецификация
 * планов — t-2026-09-14-01.
 *
 * Подписей строк слева нет: значения самоописывающие, а сравнение держится на
 * позиции — пять строк в одном порядке у всех трёх карточек, разделённые
 * теми же волосяными линиями, и одинаковая высота строки (styles `.row`),
 * чтобы одноимённые строки соседних карточек стояли на одной высоте.
 */
export default function Tariffs() {
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

      <div className={styles.plans}>
        {PLANS.map((plan) => {
          const scenario = PLAN_SCENARIOS[plan.scenario];
          return (
            <div key={plan.scenario} className={styles.plan} data-testid={`plan-${plan.scenario}`}>
              <span className="eyebrow" data-testid={`plan-name-${plan.scenario}`}>
                {plan.name}
              </span>
              <div className={styles.price}>
                {plan.price}
                <small>{plan.period}</small>
              </div>
              <p className={styles.annual}>{plan.annual || " "}</p>

              <ul className={styles.rows}>
                {plan.values.map((value) => (
                  <li key={value.text} className={styles.row}>
                    {/* Значение и маркер сноски — одним потоком: в полосе
                        ширин, где строка выравнивается по высоте флексом,
                        два соседних узла разъехались бы по краям строки. */}
                    <span>
                      {value.text}
                      {value.note ? <sup>{value.note}</sup> : null}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.trial ? (
                <p className={styles.trial} data-testid={`plan-trial-${plan.scenario}`}>
                  <strong>{plan.trial.lead}</strong>
                  {plan.trial.text}
                </p>
              ) : null}

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

      <p className={styles.foot} data-testid="plans-footnotes">
        {FOOTNOTES.map((footnote) => (
          <span key={footnote.mark}>
            <sup>{footnote.mark}</sup> {footnote.text}
          </span>
        ))}
      </p>
    </section>
  );
}
