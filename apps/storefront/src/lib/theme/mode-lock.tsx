"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Whether the visitor may change this page's mode (t-2026-10-12-33 T0c). The root layout
 * locks it on a light-only palette (`isLightOnlyTheme`), whose tokens have no dark set; the
 * mode switch (`ModeToggle`, every call site) then draws nothing. Unlocked with no provider,
 * which is every page it was before.
 */
const ModeLockContext = createContext(false)

export function ModeLockProvider({ locked, children }: { locked: boolean; children: ReactNode }) {
  return <ModeLockContext.Provider value={locked}>{children}</ModeLockContext.Provider>
}

export const useModeLocked = () => useContext(ModeLockContext)
