import { useRef } from "react";
import styles from "./styles.module.css";
import {
  deliveryItems,
  heading,
  intro,
  kickerNumber,
  kickerText,
  sectionLabel,
  serviceCountLabel,
} from "./data";

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Delivery({ num }: { num?: string }) {
  const railRef = useRef<HTMLUListElement>(null);

  // Ports dc-script.js `scrollRail` (lines 36-41): scroll the rail by one card width (first
  // child's rendered width + 1px gap), smoothly, in the given direction. `prevDel`/`nextDel`
  // (lines 417-418) only ever pass the sign (-209 / 209) through `Math.sign(d)` — the actual
  // scroll distance always comes from the rendered card width, same pattern already ported in
  // `operations`.
  const scrollRail = (direction: 1 | -1) => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 1 : 209;
    node.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <section
      data-section="delivery"
      data-testid="sec-delivery"
      data-screen-label={sectionLabel}
      id="sec-delivery"
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

      <p className={styles.intro}>{intro}</p>

      <div className={styles.navRow}>
        <span className={styles.count}>{serviceCountLabel}</span>
        <button
          type="button"
          title="Назад"
          className={styles.navButton}
          onClick={() => scrollRail(-1)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.iconBack}
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          title="Вперёд"
          className={styles.navButton}
          onClick={() => scrollRail(1)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <ul id="rail-delivery" ref={railRef} className={styles.rail}>
        {deliveryItems.map((item) => (
          <li className={styles.card} key={item.name}>
            <span className={styles.iconSlot}>
              {item.logo ? (
                <img
                  src={item.logo}
                  alt={item.name}
                  loading="lazy"
                  className={styles.logo}
                  style={{ width: item.logoW, height: item.logoH }}
                />
              ) : (
                <svg
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#71717A"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.icon}
                >
                  <path d={item.iconD1} />
                  <path d={item.iconD2} />
                </svg>
              )}
            </span>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.kind}>{item.kind}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
