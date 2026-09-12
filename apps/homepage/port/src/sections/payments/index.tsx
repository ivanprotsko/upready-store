import { useState } from 'react';
import styles from './styles.module.css';
import {
  eyebrowNumber,
  eyebrowLabel,
  headingLine1,
  headingLine2,
  intro,
  payGroups,
  payMore,
} from './data';

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Payments({ num }: { num?: string }) {
  const [openIndex, setOpenIndex] = useState(-1);

  return (
    <section
      data-section="payments"
      data-testid="sec-payments"
      id="sec-payments"
      className={styles.section}
    >
      <i className={styles.cornerTL} />
      <i className={styles.cornerTR} />

      <div className={styles.eyebrowRow}>
        <span className={styles.eyebrowDot} />
        <span className={styles.eyebrowLabel}>
          {num ?? eyebrowNumber} · {eyebrowLabel}
        </span>
      </div>

      <h2 className={styles.heading}>
        {headingLine1}
        <br />
        {headingLine2}
      </h2>

      <p className={styles.intro}>{intro}</p>

      <div className={styles.groupsGrid}>
        {payGroups.map((group) => (
          <div className={styles.groupCard} key={group.tag}>
            <span className={styles.groupTag}>{group.tag}</span>
            <div className={styles.brandsWrap}>
              {group.brands.map((brand) => (
                <span className={styles.brandChip} key={brand.name}>
                  <img
                    className={styles.brandLogo}
                    src={brand.logo}
                    alt={brand.name}
                    loading="lazy"
                    style={{ width: brand.w }}
                  />
                </span>
              ))}
            </div>
            <p className={styles.groupNote}>{group.note}</p>
          </div>
        ))}
      </div>

      <div className={styles.accordion}>
        {payMore.map((item, index) => {
          const open = openIndex === index;
          return (
            <div className={styles.accordionItem} key={item.n}>
              <button
                type="button"
                className={styles.accordionButton}
                onClick={() => setOpenIndex((prev) => (prev === index ? -1 : index))}
              >
                <span className={styles.accordionButtonHead}>
                  <span className={styles.accordionNumber}>{item.n}</span>
                  <span className={styles.accordionTitle}>{item.title}</span>
                </span>
                <span
                  className={styles.accordionIcon}
                  style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
                >
                  <span className={styles.accordionIconH} />
                  <span className={styles.accordionIconV} />
                </span>
              </button>
              {open && (
                <div className={styles.accordionPanel}>
                  {item.lines.map((line, lineIndex) => (
                    <p className={styles.accordionLine} key={lineIndex}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
