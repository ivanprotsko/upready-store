"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { enterMiniApp } from "@lib/data/telegram-cart"
import { miniAppEntry, runMiniAppEntry } from "@lib/telegram/mini-app-entry"
import { getWebApp, isTelegramLaunch, loadWebApp, type TelegramWebApp } from "@lib/telegram/web-app"

/** Once per webview session: a buyer who signs out inside the Mini App stays signed out. */
const SILENT_SIGN_IN_KEY = "__upready_tg_sign_in"

/**
 * Mounted once in the root layout; renders nothing. In a browser it does
 * nothing at all — `isTelegramLaunch()` is false and no script is loaded.
 *
 * Inside a Telegram client it loads telegram-web-app.js, tells Telegram the
 * page is ready, expands the webview, marks `<html data-tg="1">`, follows
 * Telegram's colour scheme on the store's own `data-mode` axis, and drives the
 * native back button: hidden on the catalog (the entry), shown everywhere else
 * and wired to history — the header's own links keep working, this only adds
 * the control a Telegram user reaches for first.
 *
 * It also opens the cart the buyer filled in the chat with the shop's bot and
 * signs the buyer in, both from `initData` (verified on the backend with the
 * shop's own bot), then refreshes, because the page was server-rendered signed
 * out and with the webview's own cart. The cart is opened on every launch, the
 * sign-in runs once per webview session (`lib/telegram/mini-app-entry.ts`).
 *
 * `modeLocked`: the page paints a light-only palette (t-2026-10-12-33 T0c), and Telegram's
 * colour scheme leaves `data-mode` as the server wrote it.
 */
export default function MiniAppBridge({ modeLocked = false }: { modeLocked?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [tg, setTg] = useState<TelegramWebApp | undefined>(undefined)

  useEffect(() => {
    if (!isTelegramLaunch()) return
    let cancelled = false
    loadWebApp().then((webApp) => {
      if (cancelled) return
      if (!webApp) {
        // telegram-web-app.js did not load, so the checkout entry stops waiting.
        miniAppEntry.mark()
        return
      }
      document.documentElement.dataset.tg = "1"
      if (webApp.colorScheme && !modeLocked) {
        document.documentElement.dataset.mode = webApp.colorScheme
      }
      webApp.ready()
      webApp.expand()
      // Bot API 7.7+: a vertical swipe on the catalog scrolls it instead of
      // closing the app. Older clients ignore the call.
      webApp.disableVerticalSwipes?.()
      setTg(webApp)

      runMiniAppEntry({
        initData: webApp.initData,
        signInDone: silentSignInDone,
        markSignInDone: markSilentSignInDone,
        enter: enterMiniApp,
        refresh: () => {
          if (!cancelled) router.refresh()
        },
      }).finally(() => miniAppEntry.mark())
    })
    return () => {
      cancelled = true
    }
  }, [router, modeLocked])

  useEffect(() => {
    const webApp = tg ?? getWebApp()
    if (!webApp) return
    const atEntry = /^\/[a-z]{2}(?:-[A-Za-z]{2,4})?(?:\/store)?\/?$/.test(pathname)
    if (atEntry) {
      webApp.BackButton.hide()
      return
    }
    const back = () => router.back()
    webApp.BackButton.show()
    webApp.BackButton.onClick(back)
    return () => webApp.BackButton.offClick(back)
  }, [tg, pathname, router])

  return null
}

function silentSignInDone(): boolean {
  try {
    return window.sessionStorage.getItem(SILENT_SIGN_IN_KEY) === "1"
  } catch {
    return false
  }
}

function markSilentSignInDone() {
  try {
    window.sessionStorage.setItem(SILENT_SIGN_IN_KEY, "1")
  } catch {}
}
