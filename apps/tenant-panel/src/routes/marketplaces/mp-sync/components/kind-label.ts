import { useCallback } from "react"
import { useTranslation } from "react-i18next"

/**
 * The owner's words for a kind of data and for the state of its last run
 * (task-07 of ask-20261005-023327-f02b).
 *
 * Every kind and state the backend schedules has a name in
 * `marketplaces.kinds.*` and `marketplaces.statuses.*`, and
 * `mp-sync-kinds-translated.test.mjs` fails when one arrives without it. A
 * kind that still slips through reads «другие данные», never its id in
 * Latin: the id is a word of the code, not of the shop.
 */
export const useSyncLabels = () => {
  const { t, i18n } = useTranslation()

  const kindLabel = useCallback(
    (kind: string) =>
      i18n.exists(`marketplaces.kinds.${kind}`) ? t(`marketplaces.kinds.${kind}`) : t("mp.sync.otherKind"),
    [t, i18n]
  )

  const statusLabel = useCallback(
    (status: string) =>
      i18n.exists(`marketplaces.statuses.${status}`)
        ? t(`marketplaces.statuses.${status}`)
        : t("mp.sync.otherState"),
    [t, i18n]
  )

  return { kindLabel, statusLabel }
}
