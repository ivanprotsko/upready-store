"use client"

import { useEffect, useRef } from "react"
import { useLocale } from "next-intl"

import type { TelegramWidgetUser } from "@lib/data/telegram-auth"

const WIDGET_SCRIPT = "https://telegram.org/js/telegram-widget.js?22"
const CALLBACK = "__upreadyTelegramAuth"

declare global {
  interface Window {
    __upreadyTelegramAuth?: (user: TelegramWidgetUser) => void
  }
}

/**
 * The official Telegram Login Widget (https://core.telegram.org/widgets/login).
 * It only draws its button on the domain set for the bot with @BotFather
 * `/setdomain`; anywhere else Telegram itself shows «Bot domain invalid».
 */
export default function TelegramWidget({
  botUsername,
  onAuth,
}: {
  botUsername: string
  onAuth: (user: TelegramWidgetUser) => void
}) {
  const locale = useLocale()
  const containerRef = useRef<HTMLDivElement>(null)
  const onAuthRef = useRef(onAuth)

  useEffect(() => {
    onAuthRef.current = onAuth
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    window[CALLBACK] = (user) => onAuthRef.current(user)

    const script = document.createElement("script")
    script.src = WIDGET_SCRIPT
    script.async = true
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", "large")
    script.setAttribute("data-radius", "8")
    script.setAttribute("data-userpic", "false")
    script.setAttribute("data-lang", locale)
    script.setAttribute("data-onauth", `${CALLBACK}(user)`)
    container.appendChild(script)

    return () => {
      delete window[CALLBACK]
      container.replaceChildren()
    }
  }, [botUsername, locale])

  return <div ref={containerRef} className="flex justify-center min-h-[40px]" />
}
