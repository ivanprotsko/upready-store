import type { ManualPaymentContacts } from "@lib/tenant/manual-payment"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"

type Props = {
  /** The shop's own contacts, from `tenant.metadata.manual_payment.manager`; never a default. */
  contacts: ManualPaymentContacts
  /** Prefilled text for the messenger, e.g. the order number and total once an order exists. */
  message?: string
  /** The email subject, used only when `message` is set. */
  emailSubject?: string
  variant?: "compact" | "full"
}

/**
 * WhatsApp / Telegram / Email buttons that open a chat with the shop's manager
 * (olavka-payments). Renders one button per contact the owner entered and
 * nothing for a contact left empty; with no contact at all it says the manager
 * reaches out after the order instead, so the block is never a set of dead
 * links.
 */
const ManagerContactCTA = ({
  contacts,
  message,
  emailSubject,
  variant = "compact",
}: Props) => {
  const t = useTranslations("ManualPayment")
  const encoded = message ? encodeURIComponent(message) : ""

  const buttons: { label: string; href: string }[] = []

  if (contacts.whatsapp) {
    const number = contacts.whatsapp.replace(/^\+/, "")
    buttons.push({
      label: t("contactWhatsapp"),
      href: `https://wa.me/${number}${encoded ? `?text=${encoded}` : ""}`,
    })
  }
  if (contacts.telegram) {
    buttons.push({
      label: t("contactTelegram"),
      href: `https://t.me/${contacts.telegram}${encoded ? `?text=${encoded}` : ""}`,
    })
  }
  if (contacts.email) {
    const params = new URLSearchParams()
    if (emailSubject) {
      params.set("subject", emailSubject)
    }
    if (message) {
      params.set("body", message)
    }
    const query = params.toString()
    buttons.push({
      label: t("contactEmail"),
      href: `mailto:${contacts.email}${query ? `?${query}` : ""}`,
    })
  }

  if (buttons.length === 0) {
    return (
      <p className="txt-compact-small text-ui-fg-subtle" data-testid="manager-no-contacts">
        {t("noContacts")}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="manager-contacts">
      {buttons.map((button) => (
        <a
          key={button.label}
          href={button.href}
          target="_blank"
          rel="noopener noreferrer"
          className={clx(
            "inline-flex items-center justify-center rounded-md border border-ui-border-base bg-ui-bg-base px-4 text-ui-fg-base transition-colors hover:bg-ui-bg-base-hover",
            {
              "h-9 txt-compact-small-plus": variant === "compact",
              "h-11 txt-compact-medium-plus": variant === "full",
            }
          )}
        >
          {button.label}
        </a>
      ))}
    </div>
  )
}

export default ManagerContactCTA
