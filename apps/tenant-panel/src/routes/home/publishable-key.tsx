import { useState } from "react"
import copy from "copy-to-clipboard"
import { useTranslation } from "react-i18next"
import { CheckCircleSolid, SquareTwoStack } from "@medusajs/icons"
import { IconButton, Text, toast } from "@medusajs/ui"

// tenant-panel: small copy-to-clipboard control for the Overview page,
// showing the tenant's publishable key in its redacted form with a button
// that copies the real token. Modeled on the Admin's
// components/common/display-id (also `copy-to-clipboard` + a toast), which
// only ever shows a truncated id and isn't a fit for a value that must be
// pasted whole into a storefront's env.
export const PublishableKey = ({
  redacted,
  token,
}: {
  redacted: string
  token: string
}) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copy(token)
    setCopied(true)
    toast.success(t("actions.idCopiedToClipboard"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-x-1.5">
      <Text size="small" family="mono" className="text-ui-fg-subtle">
        {redacted}
      </Text>
      <IconButton size="2xsmall" variant="transparent" onClick={handleCopy}>
        {copied ? <CheckCircleSolid /> : <SquareTwoStack />}
      </IconButton>
    </div>
  )
}
