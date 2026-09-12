import styles from "./styles.module.css";
import {
  bullets,
  diagram,
  eyebrowLabel,
  eyebrowNumber,
  figureCaption,
  heading,
  paragraphPrimary,
  paragraphSecondary,
} from "./data";

/**
 * frame — «Рамка».
 *
 * Static content: no `show*` visibility flag and no interactive behaviour in
 * reference/dc-script.js touches this section directly (grepped for the
 * section's own copy and for the "frame" key — the only hits are the shared
 * `state.blocks.frame` on/off switch and the `num.frame` sequence number,
 * both owned by the admin panel / cross-section numbering in App.tsx, not by
 * this component). The eyebrow's "04" is copied verbatim from the captured
 * reference (all blocks toggled on) — see data.ts and "Needs from merger"
 * below.
 */
/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Frame({ num }: { num?: string }) {
  return (
    <section
      data-section="frame"
      data-testid="sec-frame"
      className={styles.section}
    >
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />

      <div className={styles.grid}>
        <div>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrowDot} />
            <span className={styles.eyebrowText}>
              {num ?? eyebrowNumber} · {eyebrowLabel}
            </span>
          </div>
          <h2 className={styles.heading}>{heading}</h2>
          <p className={styles.paragraphPrimary}>{paragraphPrimary}</p>
          <p className={styles.paragraphSecondary}>{paragraphSecondary}</p>
          <ul className={styles.list}>
            {bullets.map((text) => (
              <li key={text} className={styles.listItem}>
                <span className={styles.listDash}>—</span>
                <span className={styles.listText}>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className={styles.figure}>
          <div className={styles.diagramCard}>
            <svg
              viewBox="0 0 560 250"
              width="100%"
              role="img"
              aria-label={diagram.ariaLabel}
            >
              <text
                x="0"
                y="11"
                fontFamily="Roboto Mono, monospace"
                fontSize="10.5"
                letterSpacing="1"
                fill="#A1A1AA"
              >
                {diagram.nowLabel}
              </text>
              <circle cx="30" cy="34" r="3" fill="#D4D4D8" />
              <circle cx="130" cy="34" r="3" fill="#D4D4D8" />
              <circle cx="230" cy="34" r="3" fill="#D4D4D8" />
              <path
                d="M30 38 L92 128 M130 38 L130 128 M230 38 L168 128"
                stroke="#D4D4D8"
                strokeWidth="1.2"
                fill="none"
              />
              <text
                x="30"
                y="26"
                fontFamily="Inter, sans-serif"
                fontSize="11"
                fill="#71717A"
              >
                {diagram.salesLabelLeft}
              </text>
              <rect x="50" y="132" width="160" height="42" fill="#18181B" />
              <text
                x="130"
                y="158"
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontSize="13"
                fontWeight="500"
                fill="#ffffff"
              >
                {diagram.wbBoxLabel}
              </text>
              <path
                d="M50 190 H210"
                stroke="#E4E4E7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x="50"
                y="210"
                fontFamily="Roboto Mono, monospace"
                fontSize="11"
                fill="#71717A"
              >
                {diagram.singlePointOfFailure}
              </text>
              <line
                x1="272"
                y1="0"
                x2="272"
                y2="250"
                stroke="#E4E4E7"
                strokeDasharray="3 3"
              />
              <text
                x="300"
                y="11"
                fontFamily="Roboto Mono, monospace"
                fontSize="10.5"
                letterSpacing="1"
                fill="#A1A1AA"
              >
                {diagram.planBLabel}
              </text>
              <circle cx="303" cy="34" r="3" fill="#D4D4D8" />
              <text
                x="313"
                y="38"
                fontFamily="Inter, sans-serif"
                fontSize="11"
                fill="#71717A"
              >
                {diagram.salesLabelRight}
              </text>
              <path
                d="M303 40 V186 M303 62 H320 M303 122 H320 M303 182 H320"
                stroke="#D4D4D8"
                strokeWidth="1.2"
                fill="none"
              />
              <rect x="320" y="42" width="240" height="42" fill="#18181B" />
              <text
                x="334"
                y="60"
                fontFamily="Inter, sans-serif"
                fontSize="12.5"
                fontWeight="500"
                fill="#ffffff"
              >
                {diagram.wbBoxLabel2}
              </text>
              <text
                x="334"
                y="76"
                fontFamily="Roboto Mono, monospace"
                fontSize="10.5"
                fill="#A1A1AA"
              >
                {diagram.mainTraffic}
              </text>
              <rect
                x="320"
                y="102"
                width="240"
                height="42"
                fill="#ffffff"
                stroke="#2563EB"
              />
              <text
                x="334"
                y="120"
                fontFamily="Inter, sans-serif"
                fontSize="12.5"
                fontWeight="500"
                fill="#18181B"
              >
                {diagram.ownShopLabel}
              </text>
              <text
                x="334"
                y="136"
                fontFamily="Roboto Mono, monospace"
                fontSize="10.5"
                fill="#2563EB"
              >
                {diagram.insuranceLabel}
              </text>
              <rect
                x="320"
                y="162"
                width="240"
                height="42"
                fill="#ffffff"
                stroke="#D4D4D8"
                strokeDasharray="4 3"
              />
              <text
                x="334"
                y="180"
                fontFamily="Inter, sans-serif"
                fontSize="12.5"
                fontWeight="500"
                fill="#71717A"
              >
                {diagram.otherPlatformsLabel}
              </text>
              <text
                x="334"
                y="196"
                fontFamily="Roboto Mono, monospace"
                fontSize="10.5"
                fill="#A1A1AA"
              >
                {diagram.catalogAlreadyPortable}
              </text>
              <text
                x="320"
                y="228"
                fontFamily="Inter, sans-serif"
                fontSize="12.5"
                fill="#18181B"
              >
                {diagram.bottomLine}
              </text>
            </svg>
          </div>
          <figcaption className={styles.figcaption}>
            {figureCaption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
