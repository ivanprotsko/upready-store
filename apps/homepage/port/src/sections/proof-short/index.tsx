import styles from "./styles.module.css";
import { eyebrow, linkHref, linkLabel, summary } from "./data";

/**
 * proof-short — «Почему это про вас — коротко».
 *
 * Static content, no visibility flags and no interactive behaviour in
 * reference/dc-script.js touch this section (grepped for the section's
 * text and for "proof-short" — no matches beyond the FAQ/pricing copy
 * that happens to also mention Wildberries). It is a plain summary
 * paragraph with an anchor link down to #proof-full.
 */
export default function ProofShort() {
  return (
    <section
      data-section="proof-short"
      data-testid="sec-proof-short"
      className={styles.section}
    >
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />
      <div className={styles.row}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <p className={styles.summary}>{summary}</p>
        <a className={styles.link} href={linkHref}>
          {linkLabel}
        </a>
      </div>
    </section>
  );
}
