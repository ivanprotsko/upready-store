import styles from './styles.module.css';
import { chart, chartCaption, docCaption, docCard, heading, kickerNumber, kickerText, paragraphs, sectionLabel, sourceNote } from './data';

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function ProofFull({ num }: { num?: string }) {
  return (
    <section
      data-section="proof-full"
      data-testid="sec-proof-full"
      data-screen-label={sectionLabel}
      id="proof-full"
      className={styles.section}
    >
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />

      <div className={styles.kickerRow}>
        <span className={styles.dot} />
        <span className={styles.kicker}>
          {num ?? kickerNumber} · {kickerText}
        </span>
      </div>
      <h2 className={styles.heading}>{heading}</h2>

      <div className={styles.grid}>
        <div className={styles.textCol}>
          {paragraphs.map((p) => (
            <p key={p.text} className={p.variant === 'lead' ? styles.lead : styles.body}>
              {p.text}
            </p>
          ))}
          <p className={styles.sourceNote}>{sourceNote}</p>
        </div>

        <div className={styles.mediaCol}>
          <figure className={styles.figure}>
            <div className={styles.docCard}>
              <div className={styles.docHeader}>
                <svg
                  className={styles.docHeaderIcon}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#71717A"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className={styles.docHeaderLabel}>{docCard.headerLabel}</span>
                <span className={styles.docHeaderTag}>{docCard.headerTag}</span>
              </div>
              <div className={styles.docBody}>
                <div className={styles.docLine} style={{ width: docCard.lineWidths[0] }} />
                <div className={styles.docLine} style={{ width: docCard.lineWidths[1] }} />
                <div className={styles.docClause}>
                  <span className={styles.docClauseNumber}>{docCard.clauseNumber}</span>
                  <p className={styles.docClauseText}>{docCard.clauseText}</p>
                </div>
                <div className={styles.docLine} style={{ width: docCard.lineWidths[2] }} />
                <div className={styles.docLine} style={{ width: docCard.lineWidths[3] }} />
              </div>
              <div className={styles.docFooter}>
                <span className={styles.docFooterText}>{docCard.footerText}</span>
              </div>
            </div>
            <figcaption className={styles.figcaption}>{docCaption}</figcaption>
          </figure>

          <figure className={styles.figure}>
            <div className={styles.chartCard}>
              <svg viewBox="0 0 560 200" width="100%" role="img" aria-label={chart.ariaLabel}>
                <text x="0" y="11" fontFamily="Roboto Mono, monospace" fontSize="10.5" letterSpacing="1" fill="#71717A">
                  {chart.topLabel}
                </text>
                <rect x="0" y="24" width="559" height="40" fill="#F4F4F5" stroke="#E4E4E7" />
                <rect x="0" y="24" width="84" height="40" fill="#2563EB" fillOpacity="0.2" />
                <rect x="0" y="24" width="12.3" height="40" fill="#2563EB" />
                <path d="M12.3 64 V90" stroke="#D4D4D8" strokeWidth="1" />
                <text x="20" y="88" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="500" fill="#18181B">
                  {chart.point1Value}
                </text>
                <text x="20" y="107" fontFamily="Inter, sans-serif" fontSize="12.5" fill="#52525B">
                  {chart.point1Note}
                </text>
                <path d="M84 64 V136" stroke="#D4D4D8" strokeWidth="1" />
                <text x="92" y="134" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="500" fill="#18181B">
                  {chart.point2Value}
                </text>
                <text x="92" y="153" fontFamily="Inter, sans-serif" fontSize="12.5" fill="#52525B">
                  {chart.point2Note}
                </text>
                <line x1="0" y1="174" x2="559" y2="174" stroke="#E4E4E7" />
                <text x="0" y="192" fontFamily="Roboto Mono, monospace" fontSize="10.5" fill="#A1A1AA">
                  {chart.sourceLabel}
                </text>
              </svg>
            </div>
            <figcaption className={styles.figcaption}>{chartCaption}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
