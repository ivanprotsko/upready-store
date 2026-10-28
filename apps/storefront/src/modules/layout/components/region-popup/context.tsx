"use client"

import type { RegionRedirect } from "@lib/tenant/region-redirects"
import { createContext, useContext } from "react"

/**
 * The shop's countries that lead to another shop (t-2026-10-20-22), for the header's
 * region switcher: it lists them and sends a pick there, the way the popup does. Empty
 * outside the provider, which leaves the switcher as it always was.
 */
const RegionRedirectsContext = createContext<RegionRedirect[]>([])

export const RegionRedirectsProvider = ({
  redirects,
  children,
}: {
  redirects: RegionRedirect[]
  children: React.ReactNode
}) => (
  <RegionRedirectsContext.Provider value={redirects}>
    {children}
  </RegionRedirectsContext.Provider>
)

export const useRegionRedirects = () => useContext(RegionRedirectsContext)
