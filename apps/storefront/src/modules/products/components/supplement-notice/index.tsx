type SupplementNoticeProps = {
  /** «Не является лекарственным средством» in the page's language (`ProductInfo.supplementNotice`). */
  text: string
}

/**
 * The warning a product marked as a dietary supplement carries under its description
 * (t-2026-10-09-49): in the product card under the excerpt, and in the «Характеристики и
 * описание» drawer under the whole text. Plain body text in the description's own size, never
 * folded away, so it is read without a click. Which products get it is `showsSupplementNotice`
 * in `lib/util/regulated-product.ts`.
 */
const SupplementNotice = ({ text }: SupplementNoticeProps) => (
  <p
    className="text-sm font-medium leading-6 text-ui-fg-base"
    data-testid="product-supplement-notice"
  >
    {text}
  </p>
)

export default SupplementNotice
