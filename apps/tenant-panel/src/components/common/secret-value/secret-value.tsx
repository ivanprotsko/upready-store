import { Button, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

type SecretValueProps = {
  /** The whole value, secret part included. */
  value: string
  /** What stands on the screen while the value is hidden. */
  hidden: string
  testId?: string
}

/**
 * A value that carries a secret (o21-owner-panel-ux): an address with a token
 * in it, a key. The screen shows `hidden` until the owner presses «Показать»,
 * so a screenshot sent to anybody, or a phone seen over the shoulder, does not
 * give the secret away. «Копировать» works in both states.
 */
export const SecretValue = ({ value, hidden, testId }: SecretValueProps) => {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t("actions.copied"))
    } catch {
      toast.error(t("supportDetails.copyFailed"))
    }
  }

  return (
    <div className="flex flex-col gap-y-2" data-testid={testId}>
      <Text size="small" className="break-all font-mono" data-secret-shown={shown}>
        {shown ? value : hidden}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="secondary"
          type="button"
          className="max-lg:min-h-11"
          aria-pressed={shown}
          onClick={() => setShown((now) => !now)}
        >
          {shown ? t("actions.hide") : t("actions.show")}
        </Button>
        <Button
          size="small"
          variant="secondary"
          type="button"
          className="max-lg:min-h-11"
          onClick={copy}
        >
          {t("actions.copy")}
        </Button>
      </div>
    </div>
  )
}

/** `https://host/path?tenant=…&token=…` → `https://host/path?••••••••` */
export const hideQuery = (address: string) => {
  const at = address.indexOf("?")
  return at === -1 ? "••••••••" : `${address.slice(0, at)}?••••••••`
}
