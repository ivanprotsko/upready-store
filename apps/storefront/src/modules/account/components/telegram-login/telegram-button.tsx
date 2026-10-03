"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale } from "next-intl"
import { Button } from "@medusajs/ui"

import type { TelegramWidgetUser } from "@lib/data/telegram-auth"
import type { TelegramBot } from "@lib/data/telegram-bot"
import TelegramMark from "./telegram-mark"

/**
 * The «Войти через Телеграм» control, shared by the sign-in
 * (`./index.tsx`) and «Привязать Telegram» in the profile (t-cherk-telegram-login).
 *
 * It is our own `@medusajs/ui` button rather than Telegram's iframe widget:
 * the widget draws Telegram's own blue button, in Telegram's own words, and
 * only on the bot's `/setdomain` domain, so on every other host it is an empty
 * box. The button opens the same Telegram popup the widget opens, through
 * `Telegram.Login.auth` from the official `telegram-widget.js`, and gets the
 * same signed payload back. The payload goes to the backend unchanged, which
 * checks it against the shop's own bot token (`/auth/customer/telegram`).
 *
 * Two ways the payload can come back, both handled:
 *   1. the popup posts it to this window and closes (desktop, most phones);
 *   2. the popup has no opener and sends the tab itself back to this page
 *      with `#tgAuthResult=<base64 JSON>` (a phone browser that opened it as a
 *      plain tab). The page then reads the fragment on mount.
 * If the script never loaded (a blocker, a dead network), the click takes
 * the tab itself to Telegram, which comes back by way 2.
 */

const WIDGET_SCRIPT = "https://telegram.org/js/telegram-widget.js?22"
const OAUTH_ORIGIN = "https://oauth.telegram.org"

type TelegramLoginApi = {
  auth: (
    options: { bot_id: number; request_access?: string; lang?: string },
    callback: (user: TelegramWidgetUser | false) => void
  ) => void
}

/**
 * Read through a cast rather than a `declare global`: `lib/telegram/web-app.ts`
 * already types `window.Telegram` for the Mini App, and a second declaration
 * of the same property with another shape does not compile.
 */
const telegramLoginApi = (): TelegramLoginApi | undefined =>
  (window as unknown as { Telegram?: { Login?: TelegramLoginApi } }).Telegram?.Login

let scriptPromise: Promise<void> | null = null

/** Injects `telegram-widget.js` once per page, however many buttons render. */
const loadWidgetScript = (): Promise<void> => {
  if (telegramLoginApi()) {
    return Promise.resolve()
  }
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = WIDGET_SCRIPT
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error("telegram-widget.js did not load"))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/** Way 2 above. Consumed once per page load, by whichever button mounts first. */
let fragmentConsumed = false

const readAuthFragment = (): TelegramWidgetUser | null => {
  if (fragmentConsumed) {
    return null
  }
  const match = /[#?&]tgAuthResult=([A-Za-z0-9\-_=]*)$/.exec(window.location.hash)
  if (!match) {
    return null
  }
  fragmentConsumed = true
  const url = window.location.pathname + window.location.search
  window.history.replaceState(window.history.state, "", url)
  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/")
    const user = JSON.parse(window.atob(base64)) as TelegramWidgetUser
    return user && typeof user === "object" && user.hash ? user : null
  } catch {
    return null
  }
}

export default function TelegramButton({
  bot,
  label,
  pending,
  onAuth,
  testId,
}: {
  bot: TelegramBot
  label: string
  /** The caller's own transition: the button is disabled and says so while it runs. */
  pending: string | null
  onAuth: (user: TelegramWidgetUser) => void
  testId?: string
}) {
  const locale = useLocale()
  const onAuthRef = useRef(onAuth)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    onAuthRef.current = onAuth
  })

  useEffect(() => {
    const returned = readAuthFragment()
    if (returned) {
      onAuthRef.current(returned)
    }

    let alive = true
    loadWidgetScript()
      .then(() => alive && setScriptReady(true))
      .catch((error) => console.error("[telegram-login]", error))
    return () => {
      alive = false
    }
  }, [])

  const open = useCallback(() => {
    const api = telegramLoginApi()
    if (scriptReady && api) {
      api.auth({ bot_id: bot.id, request_access: "write", lang: locale }, (user) => {
        // `false` is the buyer closing the popup, which needs no message.
        if (user) {
          onAuthRef.current(user)
        }
      })
      return
    }

    const url = new URL(`${OAUTH_ORIGIN}/auth`)
    url.searchParams.set("bot_id", String(bot.id))
    url.searchParams.set("origin", window.location.origin)
    url.searchParams.set("request_access", "write")
    url.searchParams.set("lang", locale)
    url.searchParams.set("return_to", window.location.href.split("#")[0])
    window.location.assign(url.toString())
  }, [bot.id, locale, scriptReady])

  return (
    <Button
      type="button"
      variant="secondary"
      size="large"
      className="w-full"
      onClick={open}
      disabled={Boolean(pending)}
      aria-busy={Boolean(pending)}
      data-testid={testId}
    >
      <TelegramMark />
      {pending ?? label}
    </Button>
  )
}
