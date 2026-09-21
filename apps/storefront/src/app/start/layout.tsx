import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"

import styles from "./demo.module.css"

/**
 * Воронка «оплата → онбординг» (t-2026-09-12-paywall-onboarding-demo). Живёт
 * ВНЕ `[locale]` намеренно: её хосты не резолвятся ни в какого тенанта, и
 * любая страница под `[locale]` потребовала бы publishable key, которого здесь
 * нет, и ответила бы 500 (дефект A2, замерено). Store API отсюда не читается.
 *
 * Шапка перестала быть демонстрационной 2026-09-14 (t-2026-09-14-01): сюда
 * ведёт главная кнопка upready.dev, и это же адрес, который смотрит платёжный
 * провайдер при подключении. Страница, объявляющая себя тестовым стендом без
 * настоящих платежей, отвечала бы за продукт, которого нет. Имя, обратная
 * ссылка и подпись теперь называют Upready — то же, что и на лендинге.
 *
 * `robots: noindex` оставлен сознательно: воронка — это шаг сценария, а не
 * страница для поиска; индексируется лендинг upready.dev, который сюда ведёт.
 */
export const metadata: Metadata = {
  title: "Создать магазин · Upready",
  description:
    "Название, адрес и оформление — и витрина открыта. Магазин создаётся сразу, на своём поддомене.",
  robots: { index: false, follow: false },
}

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell} data-testid="demo-shell">
      <div className={styles.topbar}>
        {/* Слово ведёт на лендинг, а не на /start: человек пришёл оттуда, и
            «назад» для него — это upready.dev, а не индекс воронки. */}
        <Link className={styles.wordmark} href="https://upready.dev/">
          Upready
        </Link>
        <span className={styles.topbarNote}>три экрана до открытой витрины</span>
      </div>
      <main>{children}</main>
    </div>
  )
}
