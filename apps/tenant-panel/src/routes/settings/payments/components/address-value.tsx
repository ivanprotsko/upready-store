import { SquareTwoStack } from "@medusajs/icons"
import { Button, Copy, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * A service address the owner pastes into another dashboard (Robokassa's
 * Result URL, the Tribute and BTCPay webhooks, the address for AI agents):
 * the value of a read row, in monospace, with «Копировать» next to it
 * (design-system rule 17: «служебные адреса — строка чтения со «Скопировать»»).
 * Nothing secret is in it; a value with a secret goes through `SecretValue`.
 */
export const AddressValue = ({ value, testId }: { value: string; testId?: string }) => {
  const { t } = useTranslation()

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={testId}>
      <Text size="small" leading="compact" family="mono" className="min-w-0 break-all">
        {value}
      </Text>
      <Copy content={value} asChild>
        <Button size="small" variant="secondary" type="button" className="max-lg:min-h-11">
          <SquareTwoStack />
          {t("actions.copy")}
        </Button>
      </Copy>
    </div>
  )
}
