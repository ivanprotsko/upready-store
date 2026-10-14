import { SquareTwoStack } from "@medusajs/icons"
import { Button, Copy, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Skeleton } from "../../../components/common/skeleton"
import { RouteDrawer, useRouteModal } from "../../../components/modals"
import {
  type TelegramLinkCode,
  useCreateTelegramLink,
  useNotificationSettings,
} from "../../../hooks/api/notification-settings"

// t-2026-10-14-01 (panel redesign, G1): «Подключить Telegram» is a drawer
// without a form (design-system rule 20): three steps, the one-time link with
// «Скопировать», how long it lives, and only «Закрыть» in the footer. Route
// `telegram-connect`; «Подключить другой чат» opens the same drawer.
//
// The link is issued when the drawer opens. While it is open the settings are
// re-read every few seconds, so step 3 holds: once the owner presses
// «Запустить», `linked_at` changes, and the drawer closes with a toast naming
// the chat.

const RECHECK_MS = 3000

const TelegramConnectBody = () => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const { mutateAsync: createLink } = useCreateTelegramLink()

  const [code, setCode] = useState<TelegramLinkCode | null>(null)
  const [failed, setFailed] = useState(false)
  const issued = useRef(false)
  const closed = useRef(false)
  // `linked_at` when the drawer opened; `undefined` until the first answer.
  const linkedBefore = useRef<string | null | undefined>(undefined)

  const { settings } = useNotificationSettings({
    refetchInterval: code ? RECHECK_MS : false,
  })
  const telegram = settings?.telegram

  const issue = () => {
    setFailed(false)
    createLink(undefined, {
      onSuccess: (response) => setCode(response),
      onError: (error) => {
        setFailed(true)
        toast.error(error.message)
      },
    })
  }

  useEffect(() => {
    // Once per opening, also under StrictMode's second mount.
    if (issued.current) {
      return
    }
    issued.current = true
    issue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!telegram) {
      return
    }
    if (linkedBefore.current === undefined) {
      linkedBefore.current = telegram.linked_at
      return
    }
    if (
      code &&
      !closed.current &&
      telegram.connected &&
      telegram.linked_at !== linkedBefore.current
    ) {
      closed.current = true
      toast.success(
        t("notificationSettings.telegram.connectDrawer.done", {
          chat: telegram.chat_title || t("notificationSettings.telegram.chatUnnamed"),
        })
      )
      handleSuccess()
    }
  }, [code, telegram, handleSuccess, t])

  const minutes = code ? Math.max(1, Math.round(code.ttl_seconds / 60)) : 0

  return (
    <>
      <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
        <ol className="flex list-decimal flex-col gap-y-2 pl-5">
          {(["step1", "step2", "step3"] as const).map((step) => (
            <li key={step}>
              <Text size="small">{t(`notificationSettings.telegram.connectDrawer.${step}`)}</Text>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-y-2" data-testid="telegram-link">
          <Text size="small" weight="plus" leading="compact">
            {t("notificationSettings.telegram.connectDrawer.link")}
          </Text>
          {code ? (
            <div className="flex min-w-0 items-center gap-x-2">
              <a
                href={code.deep_link}
                target="_blank"
                rel="noreferrer"
                className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover min-w-0 flex-1 truncate font-mono"
                data-testid="telegram-deep-link"
              >
                {code.deep_link}
              </a>
              <Copy content={code.deep_link} asChild>
                <Button size="small" variant="secondary" type="button">
                  <SquareTwoStack />
                  {t("notificationSettings.telegram.connectDrawer.copy")}
                </Button>
              </Copy>
            </div>
          ) : failed ? (
            <div>
              <Button size="small" variant="secondary" type="button" onClick={issue}>
                {t("notificationSettings.telegram.connectDrawer.retry")}
              </Button>
            </div>
          ) : (
            <Skeleton className="h-8 w-full" />
          )}
          {code ? (
            <Text size="small" className="text-ui-fg-subtle text-pretty">
              {t("notificationSettings.telegram.connectDrawer.linkHint", { count: minutes })}
            </Text>
          ) : null}
        </div>
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center justify-end">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              {t("actions.close")}
            </Button>
          </RouteDrawer.Close>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}

export const TelegramConnect = () => {
  const { t } = useTranslation()
  const { settings } = useNotificationSettings()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>
            {settings?.telegram.connected
              ? t("notificationSettings.telegram.reconnect")
              : t("notificationSettings.telegram.connect")}
          </Heading>
        </RouteDrawer.Title>
      </RouteDrawer.Header>
      <TelegramConnectBody />
    </RouteDrawer>
  )
}

export { TelegramConnect as Component }
