import styles from './styles.module.css';
import { PLAN_SCENARIOS, SCENARIO_INDEX_PATH, funnelUrl } from '../../lib/funnel';
import { plans, eyebrowNumber, eyebrowLabel, heading, intro, ctaLabel } from './data';

// Куда ведёт «Оплатить». Модалка оплаты (телеграм-хэндл + ссылка Tribute) в порт НЕ
// перенесена (открытый вопрос O3 в REPORT.md), а боевая воронка ещё не выбрана
// (q-homepage-funnel-variant). До этого решения кнопка открывает ДЕМО-СЦЕНАРИЙ той же
// цены на стенде воронки: 4 900 ₽ → сценарий 1 (прямая оплата), 9 900 ₽ → сценарий 3
// (тариф «Бизнес» уже выбран). Сопоставление и его оговорка — в src/lib/funnel.ts.
//
// Behaviour ported from reference/dc-script.js `renderVals()`:
//   const plans = this.planData.map(pl => Object.assign({}, pl, {
//     open: () => this.setState({ payPlan: pl.id }),
//     ...
//   }));
// Clicking a plan's "Оплатить" button sets page-level `payPlan` state, which opens a payment
// modal (telegram-handle capture + Tribute link) rendered OUTSIDE any of the 16 split sections —
// it is not present in reference/raw or reference/rendered for any section, so it lives in the
// legacy page's root template. That modal is shared/global state this folder cannot own (contract
// item 1); see NOTES.md "Needs from merger". Locally we track which plan id was last clicked so a
// merger-supplied modal can be wired in with a single prop, and so the button is not a dead no-op.
/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Tariffs({ num }: { num?: string }) {

  return (
    <section data-section="tariffs" data-testid="sec-tariffs" id="sec-tariffs" className={styles.section}>
      <i className={styles.cornerTL} />
      <i className={styles.cornerTR} />

      <div className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrowDot} />
          <span className={styles.eyebrowText}>
            {num ?? eyebrowNumber} · {eyebrowLabel}
          </span>
        </div>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.intro}>{intro}</p>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => (
          <div className={styles.card} key={plan.id}>
            <div className={styles.tagRow}>
              <span className={styles.tag}>{plan.tag}</span>
            </div>
            <h3 className={styles.title}>{plan.title}</h3>
            <div className={styles.priceRow}>
              <span className={styles.priceValue}>
                <span className={styles.priceNumber}>{plan.price}</span>
                <span className={styles.priceCurrency}>₽</span>
              </span>
              <span className={styles.priceTerm}>{plan.term}</span>
            </div>
            <p className={styles.desc}>{plan.desc}</p>
            <ul className={styles.rows}>
              {plan.rows.map((row) => (
                <li className={styles.row} key={row}>
                  <svg
                    className={styles.rowIcon}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className={styles.rowText}>{row}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`${styles.cta} ${plan.best ? styles.ctaBest : styles.ctaDefault}`}
              title={PLAN_SCENARIOS[plan.id]?.title}
              data-testid={`tariff-cta-${plan.id}`}
              onClick={() =>
                window.open(
                  funnelUrl(PLAN_SCENARIOS[plan.id]?.path ?? SCENARIO_INDEX_PATH),
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              {ctaLabel}
            </button>
            <span className={styles.fine}>{plan.fine}</span>
          </div>
        ))}
      </div>

      <div className={styles.spacer} />
    </section>
  );
}
