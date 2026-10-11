import { NextResponse, type NextRequest } from "next/server"

import { getPlatformPricing } from "@lib/data/platform-pricing"
import { resolveOnboardingPlan } from "@lib/demo/onboarding-plan"
import { THEME_IDS } from "@lib/theme/presets.generated"

/**
 * The demo's onboarding (t-2026-09-12-paywall-onboarding-demo): it creates a
 * REAL tenant on this deployment, through the product path that already exists,
 * because a wizard that only draws a form proves nothing.
 *
 *   1. GET  /platform/pricing (no token)     → the tariff this tenant is created on (t-2026-09-27-05):
 *                                              this is the ONLY place the tariff comes from — the
 *                                              wizard's own `tariff` field is the URL's raw string,
 *                                              never trusted for the tier or the trial length
 *   2. POST /auth/tenant/emailpass/register  → a registration token
 *   3. POST /tenants (with that token)       → tenant + sales channel + key, `plan_id` and the trial
 *                                              length from step 1
 *   4. POST /auth/tenant/emailpass           → the owner's session token
 *   5. POST /tenants/seed (with that token)  → the starter catalog, so the shop opens NON-empty
 *                                              (specs/catalog-taxonomy/ABSTRACT-DATASETS.md §4)
 *   6. PUT  /tenants/home (with that token)  → the theme the wizard picked, hero image from step 5
 *
 * It runs on the SERVER, not in the browser, for a reason that is not style:
 * Medusa puts CORS on `/admin|/store|/auth` only, so `/tenants/*` has none —
 * that is why the tenant panel is served behind an nginx that proxies it
 * (deploy/compose.mt.yml). From a demo host the browser could not call step 3
 * or step 5 at all.
 *
 * After step 3 the technical subdomain `<handle>.<base>` is published by
 * `mt-ingress-sync` within its 15s interval and traefik issues the certificate;
 * measured end to end on 2026-09-11 at 70s. The reply says so rather than
 * claiming the shop is already up.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
/** The platform zone technical subdomains live in, e.g. `shipshift.dev`. */
const TENANT_BASE_DOMAIN = process.env.DEMO_TENANT_BASE_DOMAIN ?? ""
/** Where the shop owner logs in, e.g. `https://panel.shipshift.dev`. */
const PANEL_URL = process.env.DEMO_PANEL_URL ?? ""

type Body = {
  name?: string
  handle?: string
  email?: string
  password?: string
  preset?: string
  mode?: string
  /** The `?tariff=` of the wizard's own URL, forwarded as is — the browser's word for it, never trusted. */
  tariff?: string
}

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function backend(
  path: string,
  init: RequestInit & { token?: string }
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init.headers)
  headers.set("Content-Type", "application/json")
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`)
  }

  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers, cache: "no-store" })
  let body: Record<string, unknown> = {}
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    // A body-less answer is still an answer; the status carries the verdict.
  }
  return { ok: response.ok, status: response.status, body }
}

/** What the backend said, in a sentence a person reading the screen can act on. */
function reason(body: Record<string, unknown>, fallback: string): string {
  const message = typeof body.message === "string" ? body.message : null
  return message ?? fallback
}

export async function POST(request: NextRequest) {
  if (!BACKEND_URL) {
    console.error("demo onboarding: NEXT_PUBLIC_MEDUSA_BACKEND_URL is unset")
    return NextResponse.json(
      { message: "Стенд собран без адреса бэкенда — онбординг не может ничего создать." },
      { status: 500 }
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: "Тело запроса не разобрано." }, { status: 400 })
  }

  const name = (body.name ?? "").trim()
  const handle = (body.handle ?? "").trim().toLowerCase()
  const email = (body.email ?? "").trim().toLowerCase()
  const password = body.password ?? ""
  const preset = body.preset ?? "geist"
  const mode = body.mode === "dark" ? "dark" : "light"

  if (!name) {
    return NextResponse.json({ message: "Название магазина пустое." }, { status: 400 })
  }
  if (!HANDLE_RE.test(handle) || handle.length < 3 || handle.length > 63) {
    return NextResponse.json(
      { message: "Адрес магазина: строчные латинские буквы, цифры и одиночные дефисы, 3–63 знака." },
      { status: 400 }
    )
  }
  if (!email.includes("@")) {
    return NextResponse.json({ message: "Почта не похожа на адрес." }, { status: 400 })
  }
  // The backend refuses an owner's password under 8 characters
  // (`apps/backend/src/api/auth/password-length-gate.ts`, t-2026-10-11-23); checked
  // here first so the owner reads the reason in Russian.
  if (password.length < 8) {
    return NextResponse.json({ message: "Пароль короче восьми знаков." }, { status: 400 })
  }
  if (!(THEME_IDS as readonly string[]).includes(preset)) {
    return NextResponse.json({ message: "Неизвестное оформление." }, { status: 400 })
  }

  // 1. the tariff. The ONLY source of truth: the browser's `tariff` field (the
  // wizard's own URL, forwarded verbatim) is looked up here, against the SAME
  // document `/pricing` reads — never trusted for the tier or the trial length
  // (t-2026-09-27-05, order o-20260921-01 answer 3b/7a). Missing or not on the
  // page falls back to the free tier; a pricing page that failed to load at all
  // leaves the shop with no tariff rather than failing the whole wizard.
  const pricing = await getPlatformPricing()
  const tiers = pricing?.pricing.tiers ?? []
  const requestedTariff = typeof body.tariff === "string" ? body.tariff : null
  const { tier: resolvedTier, unknown: planUnknown } = resolveOnboardingPlan(tiers, requestedTariff)

  // 2. the login
  const registered = await backend("/auth/tenant/emailpass/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!registered.ok || typeof registered.body.token !== "string") {
    return NextResponse.json(
      {
        message:
          registered.status === 401 || registered.status === 400
            ? reason(registered.body, "Эта почта уже зарегистрирована — возьмите другую.")
            : reason(registered.body, "Не удалось создать вход владельца."),
      },
      { status: 400 }
    )
  }

  // 3. the shop
  const created = await backend("/tenants", {
    method: "POST",
    token: registered.body.token,
    body: JSON.stringify({
      name,
      handle,
      admin: { email },
      plan_id: resolvedTier?.id ?? null,
      plan_trial_days: resolvedTier?.trial_days ?? null,
    }),
  })
  if (!created.ok) {
    return NextResponse.json(
      { message: reason(created.body, `Магазин не создан (бэкенд ответил ${created.status}).`) },
      { status: 400 }
    )
  }

  // 4. the owner's session — also what the panel would have given them
  const session = await backend("/auth/tenant/emailpass", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  const sessionToken = typeof session.body.token === "string" ? session.body.token : null

  // 5. the starter catalog. Measured before this step existed: a shop created here opened
  //    EMPTY (acceptance wave 2, 2026-09-12). A failure is NOT fatal for the same reason the
  //    theme's is not: the shop exists, and the reason is reported, never swallowed (rule 20).
  let catalogSeeded = false
  let catalogProducts = 0
  let catalogProblem: string | null = null
  let heroImageUrl: string | null = null

  if (sessionToken) {
    const seeded = await backend("/tenants/seed", {
      method: "POST",
      token: sessionToken,
      body: JSON.stringify({ preset }),
    })
    if (seeded.ok) {
      catalogSeeded = seeded.body.seeded === true
      catalogProducts = typeof seeded.body.products === "number" ? seeded.body.products : 0
      heroImageUrl = typeof seeded.body.heroImageUrl === "string" ? seeded.body.heroImageUrl : null
      if (!catalogSeeded) {
        catalogProblem = reason(seeded.body, typeof seeded.body.reason === "string" ? seeded.body.reason : "магазин уже не пуст")
      }
    } else {
      catalogProblem = reason(seeded.body, `POST /tenants/seed ответил ${seeded.status}`)
      console.error("demo onboarding: starter catalog not seeded", seeded.status, seeded.body)
    }
  }

  // 6. the look. A failure here is NOT fatal: the shop exists and the visitor
  //    must be told it exists — the theme is the one thing they can change in
  //    the panel in ten seconds. Reported, never swallowed (rule 20).
  let themeApplied = false
  let themeProblem: string | null = null

  if (sessionToken) {
    const home = await backend("/tenants/home", {
      method: "PUT",
      token: sessionToken,
      body: JSON.stringify({
        theme: { preset },
        settings: {
          defaultMode: mode,
          header: "h1",
          hero: "k",
          tiles: "on",
          listing: "p3",
          footer: "f1",
        },
        content: {
          hero: {
            title: name,
            subtitle: "Новый магазин на общем движке, со своим адресом.",
            cta_label: "В каталог",
            cta_href: "/store",
            // The starter set's banner (step 5); null when the seed did not run, and then the
            // hero variant paints its own fallback.
            image_url: heroImageUrl,
            // The wizard speaks Russian; an English visitor of the new shop gets the same
            // promise in English (`content.hero.i18n`, read by `(main)/page.tsx`).
            i18n: {
              en: {
                subtitle: "A new shop on the shared engine, at its own address.",
                cta_label: "Shop",
              },
            },
          },
          products: { source: "popular" },
          order: ["hero", "categories", "products"],
        },
      }),
    })
    themeApplied = home.ok
    if (!home.ok) {
      themeProblem = reason(home.body, `PUT /tenants/home ответил ${home.status}`)
      console.error("demo onboarding: theme not applied", home.status, home.body)
    }
  } else {
    themeProblem = "не удалось войти владельцем сразу после создания"
    console.error("demo onboarding: no session token after create", session.status, session.body)
  }

  const tenant = (created.body.tenant ?? created.body) as Record<string, unknown>

  return NextResponse.json({
    handle,
    name,
    email,
    tenantId: typeof tenant.id === "string" ? tenant.id : null,
    storefrontUrl: TENANT_BASE_DOMAIN ? `https://${handle}.${TENANT_BASE_DOMAIN}` : null,
    storefrontHost: TENANT_BASE_DOMAIN ? `${handle}.${TENANT_BASE_DOMAIN}` : null,
    panelUrl: PANEL_URL || null,
    themeApplied,
    themeProblem,
    catalogSeeded,
    catalogProducts,
    catalogProblem,
    // The tariff the shop was actually created on (t-2026-09-27-05): never a
    // charge or a bound card, whatever `resolvedTier` names — there is no
    // payment provider behind this wizard (rule 20a).
    plan: {
      id: resolvedTier?.id ?? null,
      name: resolvedTier?.name ?? null,
      trialDays: resolvedTier?.trial_days ?? null,
      trialEndsAt: typeof tenant.plan_trial_ends_at === "string" ? tenant.plan_trial_ends_at : null,
      unknown: planUnknown,
    },
  })
}
