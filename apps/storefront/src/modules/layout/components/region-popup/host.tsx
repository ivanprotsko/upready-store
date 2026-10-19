import { cookies as nextCookies, headers as nextHeaders } from "next/headers"

import { getCountryCode } from "@lib/data/cookies"
import { listShopRegions } from "@lib/data/regions"
import { getTenantRegionRedirects } from "@lib/data/tenant-region-redirects"
import {
  REGION_CHOICE_COOKIE,
  popupCountriesOf,
  shouldAskRegion,
} from "@lib/tenant/region-redirects"
import RegionPopup from "./index"

/**
 * The first-visit region question (t-2026-10-20-22), on a shop that sends some
 * country's buyers to another shop. Nothing renders for a shop without that
 * setting, for a visitor who already answered and for a robot; the regions are
 * read only when the popup will show.
 */
export default async function RegionPopupHost() {
  const [redirects, cookies, headers] = await Promise.all([
    getTenantRegionRedirects(),
    nextCookies(),
    nextHeaders(),
  ])

  if (
    !shouldAskRegion({
      redirects,
      choice: cookies.get(REGION_CHOICE_COOKIE)?.value,
      userAgent: headers.get("user-agent"),
    })
  ) {
    return null
  }

  const [regions, currentCountry] = await Promise.all([
    listShopRegions(),
    getCountryCode(),
  ])
  const served = regions.flatMap(
    (r) => r.countries?.map((c) => c.iso_2 ?? "").filter(Boolean) ?? []
  )
  const countries = popupCountriesOf(served, redirects)

  return (
    <RegionPopup
      redirects={redirects}
      countries={countries}
      served={served}
      currentCountry={currentCountry}
    />
  )
}
