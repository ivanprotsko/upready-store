import styles from "./styles.module.css";
import { EYEBROW, HEADING, STEPS, THEN_LEAD, THEN_TEXT } from "./data";

/**
 * «Как это работает»: три экрана мастера онбординга и строка о том, что
 * происходит после открытия витрины (концепция §3).
 *
 * Номера шагов рисует CSS-счётчик, как в прототипе, — в разметке их нет.
 */
export default function How() {
  return (
    <section id="sec-how" data-section="how" data-testid="sec-how" className={styles.section}>
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>

      <div className={styles.steps}>
        {STEPS.map((step) => (
          <div key={step.title} className={styles.step}>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
        ))}
      </div>

      <p className={styles.then}>
        <b>{THEN_LEAD}</b>
        {THEN_TEXT}
      </p>
    </section>
  );
}
