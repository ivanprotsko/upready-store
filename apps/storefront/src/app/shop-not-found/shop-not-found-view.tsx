import styles from "./shop-not-found.module.css"

/**
 * The words of «Магазин не найден» (t-2026-10-12-32 FX4), apart from the
 * request so a test can render them for any address.
 *
 * Both languages at once: an address with no shop has no shop language to
 * speak, and `LOCALE_PIN` would answer a visitor of a `.dev` address in
 * Russian whatever their browser asks for. No shop name, no cart, no link to
 * any shop, no word about a server error: the address is what is wrong, and
 * the visitor's job here is to check it.
 */
export function ShopNotFoundView({ host }: { host: string }) {
  return (
    <main className={styles.shell} data-testid="shop-not-found">
      <div className={styles.panel}>
        <p className={styles.wordmark}>Upready</p>
        <h1 className={styles.title}>
          <span className={styles.titleLine} lang="ru">
            Магазин не найден
          </span>
          <span className={styles.titleLineSecond} lang="en">
            Shop not found
          </span>
        </h1>
        {host ? (
          <p className={styles.host} data-testid="shop-not-found-host">
            {host}
          </p>
        ) : null}
        <p className={styles.text} lang="ru">
          По этому адресу магазина нет. Проверьте адрес: возможно, в нём опечатка
          или магазин ещё не открыт.
        </p>
        <p className={styles.text} lang="en">
          There is no shop at this address. Check it for a typo, or the shop may
          not be open yet.
        </p>
      </div>
    </main>
  )
}

/** The address as the visitor typed it: host only, no port, no trailing dot. */
export function displayHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}
