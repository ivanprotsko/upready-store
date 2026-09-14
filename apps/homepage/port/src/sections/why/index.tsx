import { Fragment } from "react";

import { ONBOARDING_SCENARIO, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import {
  CLOSING,
  CTA_LABEL,
  EYEBROW,
  FACTS,
  HEADING,
  SOURCES,
  SOURCE_SEPARATOR,
} from "./data";

/**
 * «Почему сейчас»: три факта о зависимости от маркетплейса, замыкающая фраза
 * и один призыв. Каждое число — с первоисточником в сноске (концепция §3).
 */
export default function Why() {
  return (
    <section id="sec-why" data-section="why" data-testid="sec-why" className={styles.section}>
      <div className="head">
        <span className="eyebrow">{EYEBROW}</span>
        <h2>{HEADING}</h2>
      </div>

      <div className={styles.facts}>
        {FACTS.map((fact) => (
          <div key={fact.note} className={styles.fact}>
            <div className={styles.n}>
              {fact.number}
              <sup>{fact.note}</sup>
            </div>
            <p>{fact.text}</p>
          </div>
        ))}
      </div>

      <div className={styles.close}>
        <p>{CLOSING}</p>
        <a
          className="btn"
          href={funnelUrl(ONBOARDING_SCENARIO)}
          title={ONBOARDING_SCENARIO.title}
          data-testid="why-cta"
        >
          {CTA_LABEL}
        </a>
      </div>

      <p className={styles.foot}>
        {SOURCES.map((source, index) => (
          <Fragment key={source.href + source.prefix}>
            {index > 0 ? SOURCE_SEPARATOR : null}
            {source.prefix}
            <a href={source.href} target="_blank" rel="noopener">
              {source.label}
            </a>
          </Fragment>
        ))}
      </p>
    </section>
  );
}
