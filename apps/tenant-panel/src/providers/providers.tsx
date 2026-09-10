import { Toaster, TooltipProvider } from "@medusajs/ui"
import { QueryClientProvider } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"
import { HelmetProvider } from "react-helmet-async"
import { I18n } from "../components/utilities/i18n"
import { queryClient } from "../lib/query-client"
import { I18nProvider } from "./i18n-provider"
import { ThemeProvider } from "./theme-provider"
import { FeatureFlagProvider } from "./feature-flag-provider"

// tenant-panel: drops the Admin's `ExtensionProvider` (no extensions, so no
// `api: DashboardApp["api"]` prop to thread through it). Provider order below
// this point is unchanged from upstream.
type ProvidersProps = PropsWithChildren

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <TooltipProvider>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <FeatureFlagProvider>
              <I18n />
              <I18nProvider>{children}</I18nProvider>
              <Toaster />
            </FeatureFlagProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </TooltipProvider>
  )
}
