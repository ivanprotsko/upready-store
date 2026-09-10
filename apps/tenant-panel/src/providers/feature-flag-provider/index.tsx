import React, { createContext, useContext } from "react"

// tenant-panel: replaces the Admin's providers/feature-flag-provider, which
// fetches enabled server feature flags via hooks/api/feature-flags (GET
// /admin/feature-flags) and gates things like RBAC and view configurations.
// The panel exposes the same names (`FeatureFlagProvider`, `useFeatureFlag`,
// `useFeatureFlags`) so copied screens that call `useFeatureFlag(...)` keep
// working, but every flag is hard-coded `false` and nothing is fetched.

export type FeatureFlags = Record<string, boolean>

const NO_FLAGS: FeatureFlags = {}

interface FeatureFlagContextValue {
  flags: FeatureFlags
  isLoading: boolean
  isFeatureEnabled: (flag: string) => boolean
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: NO_FLAGS,
  isLoading: false,
  isFeatureEnabled: () => false,
})

/**
 * Matches the Admin's `useFeatureFlags` shape (a query-like `{ data, isLoading }`
 * pair) without a network call, since no flag this panel would read is ever on.
 */
export const useFeatureFlags = () => ({ data: NO_FLAGS, isLoading: false })

export const useFeatureFlag = (flag: keyof FeatureFlags): boolean => {
  const context = useContext(FeatureFlagContext)
  return context.isFeatureEnabled(flag)
}

export const useFeatureFlagContext = () => useContext(FeatureFlagContext)

interface FeatureFlagProviderProps {
  children: React.ReactNode
}

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  children,
}) => {
  return (
    <FeatureFlagContext.Provider
      value={{ flags: NO_FLAGS, isLoading: false, isFeatureEnabled: () => false }}
    >
      {children}
    </FeatureFlagContext.Provider>
  )
}
