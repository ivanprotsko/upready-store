import type { ReactNode } from "react";

import styles from "./App.module.css";

/**
 * PageShell — the page chrome that belongs to no registered section:
 * `apps/homepage/index.html` lines 55-79 (outer #FAFAFA page, the sticky
 * 60px header bar holding the logo + the shell's <Nav/>, and the shared
 * `max-width:1280px` bordered content container).
 *
 * Shared by `<App/>` and by `main.tsx`'s single-section `?section=<slug>`
 * preview, so a section measured in isolation sits in the same 1278px-wide
 * bordered column it occupies on the reference page — the item every
 * section's NOTES.md filed under "Needs from merger".
 */
export default function PageShell({ nav, children }: { nav?: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.headerBar}>
        <div className={styles.headerInner}>
          <a
            href="/"
            className={styles.logo}
            /* dc-script.js line 367: logoClick = (e) => e.preventDefault().
             * The 600ms long-press admin unlock (startPress/endPress) is
             * deliberately not ported — see REPORT.md, open issues. */
            onClick={(e) => e.preventDefault()}
          >
            <span className={styles.logoText}>Upready</span>
          </a>
          {nav}
        </div>
      </div>
      <div className={styles.container}>{children}</div>
    </div>
  );
}
