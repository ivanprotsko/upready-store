import { useRef, useState } from 'react';
import styles from './styles.module.css';
import { bodyText, headingLine1, headingLine2, kickerNumber, kickerText, opsSlides, sectionLabel } from './data';

const SLIDE_COUNT = opsSlides.length;

/**
 * `num` — page-wide ordinal handed down by App.tsx (dc-script.js's
 * `order`/`num` counter, lines 319-322). Omitted in the isolated
 * `?section=` preview, where the literal frozen in data.ts applies.
 */
export default function Operations({ num }: { num?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(1);

  // Ports dc-script.js `scrollRail` (lines 36-41): scroll the rail by one card width (first
  // child's rendered width + 1px gap), smoothly, in the given direction.
  const scrollRail = (direction: 1 | -1) => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 1 : 441;
    node.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  // Ports dc-script.js `onRail` (lines 23-30): recompute the current slide index from the rail's
  // scroll position, clamped to [1, SLIDE_COUNT], and only setState when it actually changes.
  const onRail = () => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const w = first ? first.getBoundingClientRect().width + 1 : 441;
    const i = Math.min(SLIDE_COUNT, Math.max(1, Math.round(node.scrollLeft / w) + 1));
    setSlide((prev) => (i !== prev ? i : prev));
  };

  return (
    <section data-section="operations" data-testid="sec-operations" data-screen-label={sectionLabel} className={styles.section}>
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />
      <div className={styles.header}>
        <div>
          <div className={styles.kickerRow}>
            <span className={styles.dot} />
            <span className={styles.kicker}>
              {num ?? kickerNumber} · {kickerText}
            </span>
          </div>
          <h2 className={styles.heading}>
            {headingLine1} <br />
            {headingLine2}
          </h2>
        </div>
        <div className={styles.right}>
          <p className={styles.body}>{bodyText}</p>
          <div className={styles.nav}>
            <button type="button" title="Назад" className={styles.navButton} onClick={() => scrollRail(-1)}>
              <svg
                width="15"
                height="15"
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
            <button type="button" title="Вперёд" className={styles.navButton} onClick={() => scrollRail(1)}>
              <svg
                width="15"
                height="15"
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
            <span className={styles.slideLabel}>
              слайд {slide} / {SLIDE_COUNT}
            </span>
          </div>
        </div>
      </div>
      <div id="rail-ops" ref={railRef} onScroll={onRail} className={styles.rail}>
        {opsSlides.map((s) => (
          <div className={styles.card} key={s.n}>
            <div className={styles.imageBox}>
              <img src={s.img} alt={s.title} loading="lazy" className={styles.img} />
            </div>
            <div className={styles.cardBody}>
              <div className={styles.titleRow}>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.n}>{s.n}</span>
              </div>
              <p className={styles.desc}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
