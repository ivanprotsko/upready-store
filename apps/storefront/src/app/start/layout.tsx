import type { Metadata } from "next"
import type { ReactNode } from "react"

import styles from "./demo.module.css"

/**
 * The paywall→onboarding demo (t-2026-09-12-paywall-onboarding-demo). It sits
 * OUTSIDE `[locale]` on purpose: its hosts resolve to no tenant, so every page
 * under `[locale]` would need a publishable key that does not exist and would
 * answer 500 (defect A2, measured). Nothing here reads the Store API.
 */
export const metadata: Metadata = {
  title: "Оплата → онбординг · тестовый стенд",
  description:
    "Четыре формы воронки, каждая доводит до онбординга собственного магазина. Тестовый стенд: настоящих платежей нет.",
  robots: { index: false, follow: false },
}

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell} data-testid="demo-shell">
      <div className={styles.topbar}>
        <a className={styles.wordmark} href="/start">
          Shiftship
        </a>
        <span className={styles.tag}>demo</span>
        <span className={styles.topbarNote}>тестовый стенд · настоящих платежей нет</span>
      </div>
      {children}
    </div>
  )
}
