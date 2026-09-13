import styles from "./styles.module.css";
import { DEFAULT_OPEN_INDEX, EYEBROW, HEADING, ITEMS } from "./data";

/**
 * «Вопросы»: пять пунктов на нативных `<details>`. Раскрытие держит браузер —
 * состояние страницы для этого не нужно, и вопрос остаётся раскрываемым, даже
 * если JS не выполнился.
 *
 * `defaultOpen` через атрибут `open` — это неуправляемый элемент: React ставит
 * начальное состояние, дальше им распоряжается пользователь.
 */
export default function Faq() {
  return (
    <section id="sec-faq" data-section="faq" data-testid="sec-faq" className={styles.section}>
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>

      <div className={styles.qa}>
        {ITEMS.map((item, index) => (
          <details key={item.question} open={index === DEFAULT_OPEN_INDEX}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
