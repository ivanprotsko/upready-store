"use client"

/**
 * Runtime side of the theme axes: write one attribute on `<html>` and persist it.
 * The settings panel of T0i calls nothing but these.
 *
 * Both functions are total: an unknown attribute or a value outside the axis's
 * allow-list is refused and reported, and a storage write that throws (private window,
 * blocked site data) still leaves the attribute applied — the theme flips for this
 * page even when the browser will not remember it.
 */

import { AXES, axis, isAllowed, type AxisAttr } from "./attributes"

export function applyAxis(attr: AxisAttr, value: string): boolean {
  if (!isAllowed(attr, value)) return false
  if (typeof document === "undefined") return false
  document.documentElement.setAttribute(attr, value)
  try {
    localStorage.setItem(axis(attr).storageKey, value)
  } catch {
    // a private window forgets the choice; the page still shows it
  }
  return true
}

export const applyTheme = (id: string) => applyAxis("data-theme", id)
export const applyMode = (mode: string) => applyAxis("data-mode", mode)

/** Drops every stored choice and puts each axis back on its fallback. */
export function resetAxes(): void {
  for (const a of AXES) {
    try {
      localStorage.removeItem(a.storageKey)
    } catch {
      // nothing was stored anyway
    }
    if (typeof document !== "undefined") document.documentElement.setAttribute(a.attr, a.fallback)
  }
}

/**
 * What the axes are set to right now, read off `<html>` rather than off storage, so the
 * answer matches what the visitor is actually looking at.
 */
export function readCurrent(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of AXES) {
    const value = typeof document === "undefined" ? null : document.documentElement.getAttribute(a.attr)
    out[a.attr] = isAllowed(a.attr, value) ? (value as string) : a.fallback
  }
  return out
}
