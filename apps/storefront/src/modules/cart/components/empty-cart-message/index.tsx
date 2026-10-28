import { getTranslations } from "next-intl/server"
import { Heading, Text } from "@medusajs/ui"

import InteractiveLink from "@modules/common/components/interactive-link"

const EmptyCartMessage = async () => {
  const t = await getTranslations("Cart")
  return (
    <div className="mx-auto flex max-w-[32rem] flex-col items-center px-2 py-16 text-center small:py-24" data-testid="empty-cart-message">
      <Heading
        level="h1"
        className="flex flex-row text-3xl-regular gap-x-2 items-baseline"
      >
        {t("heading")}
      </Heading>
      <Text className="text-base-regular mt-4 mb-6 max-w-[32rem]">
        {t("emptyMessage")}
      </Text>
      <div>
        <InteractiveLink href="/store">{t("exploreProducts")}</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
