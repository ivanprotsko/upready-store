import { useRef } from 'react';
import styles from './styles.module.css';
import { kickerNumber, kickerText, logos, sameSystemText, sectionLabel } from './data';

export default function SocialProof() {
  const railRef = useRef<HTMLDivElement>(null);

  // Ports dc-script.js `scrollRail`/`moveLogoRail` (reference/dc-script.js lines 36-43): scroll the
  // rail by one card width (first child's rendered width + 1px gap), smoothly, in the given direction.
  const scrollRail = (direction: 1 | -1) => {
    const node = railRef.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 1 : 340;
    node.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <section
      data-section="social-proof"
      data-testid="sec-social-proof"
      data-screen-label={sectionLabel}
      className={styles.section}
    >
      <i className={`${styles.corner} ${styles.cornerLeft}`} />
      <i className={`${styles.corner} ${styles.cornerRight}`} />
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.dot} />
          <span className={styles.kicker}>
            {kickerNumber} · {kickerText}
          </span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.metaText}>{sameSystemText}</span>
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
      </div>
      <div id="rail-logos" ref={railRef} className={styles.rail}>
        {logos.map((logo) => (
          <div className={styles.card} key={logo.name}>
            <div className={styles.imageBox}>
              <img
                src={logo.img}
                alt={logo.name}
                loading="lazy"
                className={styles.img}
                style={{ maxHeight: logo.height }}
              />
            </div>
            <div className={styles.body}>
              <div className={styles.titleRow}>
                <span className={styles.name}>{logo.name}</span>
                <span className={styles.tag}>{logo.tag}</span>
              </div>
              <p className={styles.note}>{logo.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
