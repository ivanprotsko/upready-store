import { useState } from "react";

import styles from "./styles.module.css";
import { DEFAULT_OPEN_INDEX, EYEBROW_NUMBER, FAQ_ITEMS, SHOW_TODO_MARKERS } from "./data";

/**
 * FAQ accordion (legacy id `sec-faq`).
 *
 * Behaviour ported from reference/dc-script.js `renderVals()`, `faq` mapping
 * (~line 267): a single open index (`state.faqOpen`, initial value 0),
 * toggled by clicking a question's button — clicking the open question
 * closes it (`s.faqOpen === i ? -1 : i`), clicking another opens it and
 * closes the previous one. The plus/x glyph rotates 45deg while open.
 */
/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Faq({ num }: { num?: string }) {
  const [openIndex, setOpenIndex] = useState<number>(DEFAULT_OPEN_INDEX);

  return (
    <section
      data-section="faq"
      data-testid="sec-faq"
      id="sec-faq"
      className={styles.section}
    >
      <i className={styles.cornerTL} />
      <i className={styles.cornerTR} />

      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.leftSticky}>
            <div className={styles.eyebrowRow}>
              <span className={styles.eyebrowDot} />
              <span className={styles.eyebrowText}>{num ?? EYEBROW_NUMBER} · вопросы</span>
            </div>
            <h2 className={styles.heading}>Частые вопросы</h2>
            <p className={styles.subtext}>
              Не нашли ответ — напишите в телеграм, ответим тем же текстом, что здесь.
            </p>
          </div>
        </div>

        <div className={styles.right}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i;
            const todo = SHOW_TODO_MARKERS ? item.todo : "";
            return (
              <div className={styles.item} key={item.question}>
                <button
                  type="button"
                  className={styles.itemButton}
                  onClick={() => setOpenIndex((prev) => (prev === i ? -1 : i))}
                  aria-expanded={isOpen}
                >
                  <h3 className={styles.question}>{item.question}</h3>
                  <span
                    className={
                      isOpen ? `${styles.iconWrap} ${styles.iconWrapOpen}` : styles.iconWrap
                    }
                  >
                    <span className={styles.iconH} />
                    <span className={styles.iconV} />
                  </span>
                </button>
                {isOpen && (
                  <p className={styles.answer}>
                    {item.answer}
                    {todo && <span className={styles.todoBadge}>{todo}</span>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
