import { useRef } from "react";
import styles from "./styles.module.css";
import { cards, description, heading, eyebrowLabel, nShowcase } from "./data";

// Behaviour ported from reference/dc-script.js:
// - scrollRail(id, el, d) (dc-script.js:36-42): scrolls the rail by the width of its
//   first card (+1px gap), signed by the direction of `d`. prevCard/nextCard
//   (dc-script.js:421-422) call it with d = -291 / 291 — only the sign is used, the
//   step is measured from the rail's own first child at click time.
/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Showcase({ num }: { num?: string }) {
  const railRef = useRef<HTMLDivElement | null>(null);

  const scrollRail = (direction: 1 | -1) => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 1 : 340;
    node.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <section
      data-section="showcase"
      data-testid="sec-showcase"
      id="sec-showcase"
      className={styles.section}
    >
      <div className={styles.header}>
        <div className={styles.eyebrowRow}>
          <span className={styles.dot} />
          <span className={styles.eyebrow}>
            {num ?? nShowcase} {eyebrowLabel}
          </span>
        </div>
        <h2 className={styles.heading}>{heading}</h2>
        <p className={styles.description}>{description}</p>
      </div>

      <div className={styles.navRow}>
        <button
          type="button"
          title="Назад"
          className={styles.railBtn}
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
            className={styles.iconPrev}
          >
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          title="Вперёд"
          className={styles.railBtn}
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

      <div id="rail-cards" ref={railRef} className={styles.rail}>
        {cards.map((c) => (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener"
            className={styles.card}
          >
            <div className={styles.thumb}>
              <img src={c.img} alt={c.alt} loading="lazy" />
            </div>
            <div className={styles.cardBody}>
              <span className={styles.cardEyebrow}>{c.eyebrow}</span>
              <h3 className={styles.cardTitle}>{c.title}</h3>
              <p className={styles.cardDesc}>{c.desc}</p>
            </div>
          </a>
        ))}
      </div>

      <div className={styles.spacer} />
    </section>
  );
}
