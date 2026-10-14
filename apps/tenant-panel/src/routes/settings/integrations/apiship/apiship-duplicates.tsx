import { Alert, Button, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { type ApishipResponse, useSwitchOffApishipDuplicate } from "../../../../hooks/api/apiship"

/**
 * The shop's direct СДЭК / Почта methods that are on while ApiShip serves the
 * same carrier: the buyer would see two cards with two prices. The page names
 * each and switches it off in one click, the way the Почта screen does
 * (t-2026-09-30-01).
 */
export const ApishipDuplicates = ({ duplicates }: { duplicates: ApishipResponse["duplicates"] }) => {
  const { t } = useTranslation()
  const { mutateAsync: switchOff, isPending, variables: switchingOffId } = useSwitchOffApishipDuplicate()

  if (!duplicates.length) {
    return null
  }

  const handleSwitchOff = async (duplicate: { id: string; name: string }) => {
    try {
      await switchOff(duplicate.id)
      toast.success(t("integrations.apiship.duplicateSwitchedOff", { name: duplicate.name }))
    } catch (switchError) {
      toast.error(switchError instanceof Error ? switchError.message : String(switchError))
    }
  }

  return (
    <Alert variant="warning" data-testid="apiship-duplicates">
      <div className="flex flex-col gap-y-3">
        <span>{t("integrations.apiship.duplicatesNote")}</span>
        {duplicates.map((duplicate) => (
          <div key={duplicate.id} className="flex flex-wrap items-center justify-between gap-2">
            <Text size="small" weight="plus">
              «{duplicate.name}»
            </Text>
            <Button
              type="button"
              size="small"
              variant="secondary"
              isLoading={isPending && switchingOffId === duplicate.id}
              disabled={isPending}
              onClick={() => handleSwitchOff(duplicate)}
              data-testid="apiship-duplicate-off"
            >
              {t("integrations.apiship.duplicateOff")}
            </Button>
          </div>
        ))}
      </div>
    </Alert>
  )
}
