"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { getWebApp, isTelegramLaunch, loadWebApp, type TelegramWebApp } from "@lib/telegram/web-app"

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
 */
export default function MiniAppBridge() {
  const router = useRouter()
  const pathname = usePathname()
  const [tg, setTg] = useState<TelegramWebApp | undefined>(undefined)

  useEffect(() => {
    if (!isTelegramLaunch()) return
    let cancelled = false
    loadWebApp().then((webApp) => {
      if (cancelled || !webApp) return
      document.documentElement.dataset.tg = "1"
      if (webApp.colorScheme) {
        document.documentElement.dataset.mode = webApp.colorScheme
      }
      webApp.ready()
      webApp.expand()
      // Bot API 7.7+: a vertical swipe on the catalog scrolls it instead of
      // closing the app. Older clients ignore the call.
      webApp.disableVerticalSwipes?.()
      setTg(webApp)
    })
    return () => {
      cancelled = true
    }
  }, [])

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
