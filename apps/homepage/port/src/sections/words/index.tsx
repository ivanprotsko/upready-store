import styles from "./styles.module.css";
import { COLUMNS, EYEBROW, HEADING } from "./data";

/**
 * «Три слова на деле»: под каждым абстрактным словом героя — три конкретных
 * свойства магазина (концепция §1, «территория» слова).
 */
export default function Words() {
  return (
    <section
      id="sec-words"
      data-section="words"
      data-testid="sec-words"
      className={styles.section}
    >
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>
      <div className={styles.three}>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className={styles.title}>
              {column.title}
              <small>{column.sub}</small>
            </h3>
            <ul className={styles.list}>
              {column.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
