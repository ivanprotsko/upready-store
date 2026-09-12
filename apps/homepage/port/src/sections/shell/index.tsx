import type { ReactNode } from "react";

import styles from "./styles.module.css";
import {
  CONTACT_LINK,
  FAQ_LINK,
  FOOTER_BRAND,
  FOOTER_COOKIE_PREFIX,
  FOOTER_COOKIE_TODO,
  FOOTER_DOC_STAMP,
  FOOTER_LEGAL_PREFIX,
  FOOTER_LEGAL_TODO,
  FOOTER_LINKS,
  INCLUDED_LINK,
  MAIN_NAV_LINKS,
  PRICING_LINK,
} from "./data";

export interface NavProps {
  /**
   * Mirror dc-script.js `state.blocks.{included,pricing,faq}` →
   * `showIncluded`/`showPricing`/`showFaq`: a page-wide admin toggle, not
   * owned by this section. Defaults match the initial state (all `false`),
   * which is why reference/rendered/00-shell.html shows none of these
   * links. See NOTES.md "Needs from merger".
   */
  showIncluded?: boolean;
  showPricing?: boolean;
  showFaq?: boolean;
}

export function Nav({
  showIncluded = false,
  showPricing = false,
  showFaq = false,
}: NavProps = {}) {
  return (
    <header data-section="shell-nav" data-testid="sec-shell-nav">
      <nav className={styles.nav}>
        <span className={styles.navSpacer} />

        {showIncluded && (
          <a href={INCLUDED_LINK.href} className={styles.navLink}>
            {INCLUDED_LINK.label}
          </a>
        )}
        {showPricing && (
          <a href={PRICING_LINK.href} className={styles.navLink}>
            {PRICING_LINK.label}
          </a>
        )}

        {MAIN_NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className={styles.navLink}>
            {link.label}
          </a>
        ))}

        {showFaq && (
          <a href={FAQ_LINK.href} className={styles.navLink}>
            {FAQ_LINK.label}
          </a>
        )}

        <a
          href={CONTACT_LINK.href}
          target={CONTACT_LINK.target}
          rel={CONTACT_LINK.rel}
          className={styles.navContact}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={styles.navContactIcon}
          >
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          {CONTACT_LINK.label}
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer
      data-section="shell-footer"
      data-testid="sec-shell-footer"
      className={styles.footer}
    >
      <i className={styles.cornerTL} />
      <i className={styles.cornerTR} />
      <div className={styles.grid}>
        <div className={styles.brandCol}>
          <span className={styles.brandName}>{FOOTER_BRAND}</span>
          <p className={styles.legalText}>
            {FOOTER_LEGAL_PREFIX}
            <span className={styles.todoBadge}>{FOOTER_LEGAL_TODO}</span>
          </p>
        </div>

        <div className={styles.linksCol}>
          {FOOTER_LINKS.map((link) => (
            <a key={link.label} href="#" className={styles.footerLink}>
              {link.label} <span className={styles.todoBadge}>{link.todo}</span>
            </a>
          ))}
        </div>

        <div className={styles.contactCol}>
          <a
            href={CONTACT_LINK.href}
            target={CONTACT_LINK.target}
            rel={CONTACT_LINK.rel}
            className={styles.footerContact}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.footerContactIcon}
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            {CONTACT_LINK.label}
          </a>
          <p className={styles.legalText}>
            {FOOTER_COOKIE_PREFIX}
            <span className={styles.todoBadge}>{FOOTER_COOKIE_TODO}</span>
          </p>
        </div>
      </div>

      <div className={styles.docStampWrap}>
        <p className={styles.docStamp}>{FOOTER_DOC_STAMP}</p>
      </div>
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
