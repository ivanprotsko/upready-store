import { Button, clx, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

type SupportDetailsProps = {
  /** The technical text: the answer of a marketplace, an address, an id. */
  text: string
  className?: string
}

/**
 * «Подробности для поддержки» (o21-owner-panel-ux, P3). The owner reads one
 * plain sentence on the screen; whatever only an engineer can read (the raw
 * answer of a marketplace, an address of a request, an id) sits here, closed by
 * default, with one button that copies it for a message to support.
 *
 * It is a native `<details>`: closed content is not rendered, so it stays out
 * of the screen's `innerText`, and it opens by keyboard without any script.
 */
export const SupportDetails = ({ text, className }: SupportDetailsProps) => {
  const { t } = useTranslation()

  if (!text.trim()) {
    return null
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("supportDetails.copied"))
    } catch {
      toast.error(t("supportDetails.copyFailed"))
    }
  }

  return (
    <details className={clx("group min-w-0", className)} data-testid="support-details">
      <summary className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-small flex min-h-8 cursor-pointer select-none items-center max-lg:min-h-11">
        {t("supportDetails.title")}
      </summary>
      <div className="bg-ui-bg-subtle mt-1 flex flex-col gap-y-2 rounded-md p-3">
        <pre className="text-ui-fg-subtle txt-compact-xsmall max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">
          {text}
        </pre>
        <div>
          <Button size="small" variant="secondary" type="button" onClick={copy}>
            {t("supportDetails.copy")}
          </Button>
        </div>
      </div>
    </details>
  )
}
