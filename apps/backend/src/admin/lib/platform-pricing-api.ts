/**
 * Fetch helpers for the platform pricing page editor («Тарифы»,
 * t-2026-09-25-08). Same-origin `fetch` with the admin session cookie, the way
 * `tenants-api.ts` does it. The document type is the backend schema's own
 * (a type-only import, nothing of zod reaches the admin bundle).
 */
import type {
  ButtonAction,
  PricingButton,
  PricingDocument,
  PricingTier,
} from "../../modules/platform-pricing/schema"

export type { ButtonAction, PricingButton, PricingDocument, PricingTier }

export type PricingEditorPayload = {
  pricing: PricingDocument | null
  revision: number | null
  updated_at: string | null
  preview_url?: string | null
}

export class PricingApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  })

  if (!res.ok) {
    let message = `Запрос не выполнен (${res.status})`
    try {
      const body = (await res.clone().json()) as { message?: string } | null
      if (body && typeof body.message === "string" && body.message) {
        message = body.message
      }
    } catch {
      // not JSON: keep the status line
    }
    throw new PricingApiError(message, res.status)
  }

  return (await res.json()) as T
}

export function getPricing(): Promise<PricingEditorPayload> {
  return request("/admin/platform-pricing")
}

export function savePricing(pricing: PricingDocument, revision: number | null): Promise<PricingEditorPayload> {
  return request("/admin/platform-pricing", {
    method: "POST",
    body: JSON.stringify({ pricing, revision }),
  })
}

/**
 * Where a button will lead on `/pricing`, for the line under the action
 * picker. It mirrors `pricingButtonHref` in
 * `apps/storefront/src/lib/platform-pricing/actions.ts`, which is the one that
 * decides; this is the editor's preview of it.
 */
export function describeHref(action: ButtonAction, tierId: string | null): string {
  switch (action.type) {
    case "link":
      return action.href || "—"
    case "onboarding_free":
      return tierId ? `/start/onboarding?tariff=${tierId}` : "— выберите тариф"
    case "pay_first":
      return tierId ? `/start/pay?tariff=${tierId}` : "— выберите тариф"
    case "card_trial":
      return tierId ? `/start/pay?tariff=${tierId}&trial=${action.trial_days}` : "— выберите тариф"
  }
}
