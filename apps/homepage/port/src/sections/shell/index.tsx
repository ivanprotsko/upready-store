import type { ReactNode } from "react";

import { ONBOARDING_SCENARIO, funnelUrl } from "../../lib/funnel";
import styles from "./styles.module.css";
import { CONTACT_LINK, FOOTER_BRAND, NAV_CTA_LABEL, NAV_LINKS } from "./data";

/**
 * Шапка и подвал. Раскладкой не управляются: `PageShell` рисует шапку, а
 * подвал ставит `App` последним в контейнере, поэтому в `layoutSections` этот
 * slug не попадает (см. CHROME_SLUGS в src/config/layout.ts).
 */
export function Nav() {
  return (
    <header data-section="shell-nav" data-testid="sec-shell-nav">
      <nav className={styles.nav}>
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className={styles.navLink}>
            {link.label}
          </a>
        ))}
        <a
          className={`btn ${styles.navCta}`}
          href={funnelUrl(ONBOARDING_SCENARIO)}
          title={ONBOARDING_SCENARIO.title}
          data-testid="nav-cta"
        >
          {NAV_CTA_LABEL}
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer data-section="shell-footer" data-testid="sec-shell-footer" className={styles.footer}>
      <span>{FOOTER_BRAND}</span>
      <a href={CONTACT_LINK.href} target="_blank" rel="noopener">
        {CONTACT_LINK.label}
      </a>
    </footer>
  );
}

export default function Shell({ children }: { children?: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
    </>
  );
}
