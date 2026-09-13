/**
 * The slice of Telegram's Mini App bridge this storefront touches, typed by hand
 * — no SDK, nothing in pnpm-lock.yaml for the shops that never open in Telegram.
 * Reference: https://core.telegram.org/bots/webapps ("Initializing Mini Apps").
 *
 * telegram-web-app.js reads its launch parameters from the URL fragment
 * (`tgWebAppData`, `tgWebAppPlatform`, `tgWebAppThemeParams`, …) and keeps them
 * in sessionStorage under `__telegram__initParams`, so a page reached by a full
 * navigation inside the same webview still knows it runs in Telegram
 * (measured on the script itself, version query `?63`, 2026-09-13).
 */

export const TELEGRAM_WEB_APP_SCRIPT = "https://telegram.org/js/telegram-web-app.js?63"

const INIT_PARAMS_KEY = "__telegram__initParams"

export type TelegramWebApp = {
  initData: string
  initDataUnsafe: { start_param?: string; user?: { id: number; language_code?: string } }
  platform: string
  colorScheme: "light" | "dark"
  ready: () => void
  expand: () => void
  disableVerticalSwipes?: () => void
  BackButton: {
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    offClick: (cb: () => void) => void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** True only for a page opened by a Telegram client, so browsers load nothing extra. */
export function isTelegramLaunch(): boolean {
  if (typeof window === "undefined") return false
  if (/tgWebApp(Data|Platform)=/.test(window.location.hash)) return true
  try {
    return window.sessionStorage.getItem(INIT_PARAMS_KEY) !== null
  } catch {
    return false
  }
}

export function getWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined
  return window.Telegram?.WebApp
}

let loading: Promise<TelegramWebApp | undefined> | null = null

/** Injects telegram-web-app.js once and resolves with `window.Telegram.WebApp`. */
export function loadWebApp(): Promise<TelegramWebApp | undefined> {
  const present = getWebApp()
  if (present) return Promise.resolve(present)
  if (loading) return loading
  loading = new Promise((resolve) => {
    const script = document.createElement("script")
    script.src = TELEGRAM_WEB_APP_SCRIPT
    script.async = true
    script.onload = () => resolve(getWebApp())
    script.onerror = () => resolve(undefined)
    document.head.appendChild(script)
  })
  return loading
}
