import { PencilSquare } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { Badge, Container, Heading, Text } from "@medusajs/ui"

import { ActionMenu } from "../../../../../components/common/action-menu"
import { useProductTranslations } from "../../../../../hooks/api/product-translations"
import { LOCALE_LABELS } from "../../../../../lib/locale-catalog"

// t-cherk-37: which of the shop's languages this product already has text
// for, next to the Admin's own fixed fields. The drawer behind «Перевести»
// is where a language is actually added or edited; this card only counts.

type ProductTranslationSectionProps = {
  product: HttpTypes.AdminProduct
}

export const ProductTranslationSection = ({ product }: ProductTranslationSectionProps) => {
  const { locales, isPending } = useProductTranslations(product.id)
  const translatedLocales = Object.keys(locales ?? {}).sort()

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Переводы</Heading>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: "Перевести",
                  to: "translations",
                  icon: <PencilSquare />,
                },
              ],
            },
          ]}
        />
      </div>
      <div className="px-6 py-4">
        {isPending ? (
          <Text size="small" className="text-ui-fg-subtle">
            Загружаем…
          </Text>
        ) : translatedLocales.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">
            Товар переведён только на русский. Текст на других языках показан
            на витрине с заменой на русский.
          </Text>
        ) : (
          <div className="flex flex-wrap gap-2">
            {translatedLocales.map((locale) => (
              <Badge key={locale} size="small">
                {LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Container>
  )
}
