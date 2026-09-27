/**
 * `tenant.plan_trial_ends_at` at creation time (t-2026-09-27-05): `created +
 * the tier's trial days`, or null for a tariff with no trial. `days` is
 * whatever `POST /tenants` was called with (`plan_trial_days`), which the
 * caller (the onboarding wizard's server route) has already resolved against
 * `GET /platform/pricing` — this function does no resolution of its own, only
 * the arithmetic, so `now` stays this tenant's own creation moment rather than
 * a timestamp computed earlier in the request.
 */
export function planTrialEndsAt(days: number | null | undefined, now: Date = new Date()): Date | null {
  return days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000) : null;
}
