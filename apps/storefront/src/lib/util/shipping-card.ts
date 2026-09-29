/**
 * U-12 (46df UX audit): a shipping card whose price the carrier did not give
 * (the calculation failed, the carrier's credentials do not read) used to show
 * «—» and stay choosable, and choosing it ran into the same failure one step
 * later. Such a card stays in the list, locked, with its reason in place of
 * the price, so the buyer sees why the method is missing rather than wondering
 * where it went. Russian Post is the exception: its price depends on the point
 * and its sheet quotes each point itself, so a missing list quote does not
 * mean the method cannot be used.
 */
export const isShippingCardUnpriced = ({
  priceAmount,
  isLoadingPrices,
  pricedPerPoint,
}: {
  priceAmount: number | null
  isLoadingPrices: boolean
  pricedPerPoint: boolean
}): boolean => priceAmount === null && !isLoadingPrices && !pricedPerPoint
