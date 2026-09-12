import { useEffect, useState } from "react";

import styles from "./styles.module.css";
import {
  AUDIENCE_IDS,
  AUDIENCE_STORAGE_KEY,
  AUDIENCE_STORAGE_TTL_MS,
  defaultAudience,
  heroCtaHref,
  heroCtaLabel,
  heroNote,
  heroVariants,
  type Audience,
} from "./data";

/**
 * Port of dc-script.js `resolveAudience()`: `v` / `utm_content` query param,
 * else a sessionStorage value persisted for the last 30 minutes, else the
 * component default ("cold" — matches props.json `defaultAudience.default`;
 * this port has no `defaultAudience` prop plumbed in, so the fallback is
 * hardcoded rather than threaded through).
 */
function resolveAudience(): Audience {
  let v: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    v = params.get("v") || params.get("utm_content");
    if (!v) {
      const raw = sessionStorage.getItem(AUDIENCE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { v?: string; t?: number };
        if (
          parsed &&
          typeof parsed.t === "number" &&
          Date.now() - parsed.t < AUDIENCE_STORAGE_TTL_MS
        ) {
          v = parsed.v ?? null;
        }
      }
    }
  } catch {
    v = null;
  }

  const audience = (AUDIENCE_IDS as string[]).includes(v ?? "")
    ? (v as Audience)
    : defaultAudience;

  try {
    sessionStorage.setItem(
      AUDIENCE_STORAGE_KEY,
      JSON.stringify({ v: audience, t: Date.now() }),
    );
  } catch {
    // sessionStorage unavailable (private mode, etc.) — audience just won't persist
  }

  return audience;
}

export default function Hero() {
  // Matches state.audience === null on first render in dc-script.js: the
  // component renders the default variant, then resolveAudience() runs in
  // componentDidMount and may swap it — reproduced here as an effect.
  const [audience, setAudience] = useState<Audience>(defaultAudience);

  useEffect(() => {
    setAudience(resolveAudience());
  }, []);

  const variant = heroVariants[audience];
  const headingClass =
    variant.headingMaxWidth === "15ch" ? styles.heading15 : styles.heading16;

  return (
    <section data-section="hero" data-testid="sec-hero" className={styles.hero}>
      <div className={styles.row}>
        <div className={styles.left}>
          <div className={styles.textGroup}>
            <h1 className={`${styles.heading} ${headingClass}`}>
              {variant.heading}
            </h1>
            <p className={styles.paragraph}>{variant.paragraph}</p>
          </div>
        </div>

        <div className={styles.right}>
          <p className={styles.note}>{heroNote}</p>
          <a
            href={heroCtaHref}
            target="_blank"
            rel="noopener"
            className={styles.cta}
          >
            {heroCtaLabel(audience)}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
