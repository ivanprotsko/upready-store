import { ONBOARDING_SCENARIO, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { CTA_LABEL, EYEBROW, HEADING, SUB, TELEGRAM_LINK } from "./data";

/**
 * Финальный блок: последний призыв и запасная дорога в Telegram
 * (концепция §3 «Финал»).
 */
export default function FinalCta() {
  return (
    <section
      id="start"
      data-section="final-cta"
      data-testid="sec-final-cta"
      className={styles.section}
    >
      <span className="eyebrow">{EYEBROW}</span>
      <h2>{HEADING}</h2>
      <p className={`sub ${styles.sub}`}>{SUB}</p>
      <div className={styles.ctaRow}>
        <a
          className="btn"
          href={funnelUrl(ONBOARDING_SCENARIO)}
          title={ONBOARDING_SCENARIO.title}
          data-testid="final-cta"
        >
          {CTA_LABEL}
        </a>
        <a className="textlink" href={TELEGRAM_LINK.href} target="_blank" rel="noopener">
          {TELEGRAM_LINK.label}
        </a>
      </div>
    </section>
  );
}
