import styles from './styles.module.css';
import {
  extraItems,
  extraLabel,
  footerBadge,
  footerText,
  guaranteeLabel,
  guaranteeNote,
  guaranteeText,
  heading,
  kickerNumber,
  kickerText,
  needsItems,
  needsLabel,
  sectionLabel,
} from './data';

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Pricing({ num }: { num?: string }) {
  return (
    <section data-section="pricing" data-testid="sec-pricing" data-screen-label={sectionLabel} id="sec-pricing" className={styles.section}>
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />

      <div className={styles.header}>
        <div className={styles.kickerRow}>
          <span className={styles.dot} />
          <span className={styles.kicker}>
            {num ?? kickerNumber} · {kickerText}
          </span>
        </div>
        <h2 className={styles.heading}>{heading}</h2>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>{guaranteeLabel}</span>
          <p className={styles.guaranteeText}>{guaranteeText}</p>
          <p className={styles.guaranteeNote}>{guaranteeNote}</p>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>{extraLabel}</span>
          <ul className={styles.list}>
            {extraItems.map((item) => (
              <li className={styles.listItem} key={item.t}>
                <span className={styles.dash}>—</span>
                <span className={styles.itemText}>
                  {item.t}
                  {item.todo ? <span className={styles.badge}>{item.todo}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <span className={styles.cardLabel}>{needsLabel}</span>
          <ul className={styles.list}>
            {needsItems.map((text) => (
              <li className={styles.listItem} key={text}>
                <span className={styles.dash}>—</span>
                <span className={styles.itemText}>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>{footerText}</p>
        <span className={styles.footerBadge}>{footerBadge}</span>
      </div>
    </section>
  );
}
