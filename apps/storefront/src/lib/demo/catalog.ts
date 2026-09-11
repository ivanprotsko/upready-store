/**
 * The four funnel shapes Ivan asked to compare on one stand
 * (`artifacts/docs/2026-09-12-paywall-onboarding-demo-requirements.md`), and the
 * services and plans they walk through.
 *
 * This is DEMO data with a demo price — there is no payment provider behind it
 * and no product in Medusa. It lives in one file on purpose: the point of the
 * stand is the SHAPE of the funnel, so the same three services and the same
 * plans must appear in every one of the four, or the comparison would be
 * between catalogs rather than between funnels.
 */

export type PlanId = string

export type Plan = {
  id: PlanId
  name: string
  /** Whole roubles. Demo money: formatted, never charged. */
  price: number
  summary: string
}

export type Service = {
  id: string
  name: string
  summary: string
  plans: Plan[]
  /**
   * The plan a funnel uses when it skips the plan step (funnel 4, "only the
   * service — it has a single plan"). Named rather than "the first one", so a
   * later edit to the plan order cannot silently change what funnel 4 sells.
   */
  soloPlanId: PlanId
}

export const SERVICES: Service[] = [
  {
    id: "store",
    name: "Интернет-магазин",
    summary: "Каталог, корзина, оплата, доставка. Готовая витрина на вашем домене.",
    soloPlanId: "store-start",
    plans: [
      {
        id: "store-start",
        name: "Старт",
        price: 4900,
        summary: "До 50 товаров, один язык витрины, домен третьего уровня.",
      },
      {
        id: "store-business",
        name: "Бизнес",
        price: 9900,
        summary: "Без лимита каталога, свой домен, пять языков, приём платежей.",
      },
      {
        id: "store-pro",
        name: "Про",
        price: 19900,
        summary: "Всё из «Бизнеса» плюс интеграции складов и выделенная поддержка.",
      },
    ],
  },
  {
    id: "telegram",
    name: "Телеграм-магазин",
    summary: "Тот же каталог внутри Telegram: бот, оплата, уведомления о заказах.",
    soloPlanId: "telegram-start",
    plans: [
      {
        id: "telegram-start",
        name: "Старт",
        price: 3400,
        summary: "Бот с каталогом и оплатой, уведомления о заказах в чат.",
      },
      {
        id: "telegram-business",
        name: "Бизнес",
        price: 6900,
        summary: "Плюс промокоды, сегменты подписчиков и выгрузка заказов.",
      },
    ],
  },
  {
    id: "landing",
    name: "Лендинг с оплатой",
    summary: "Одна страница под один товар или услугу и приём платежей на ней.",
    soloPlanId: "landing-solo",
    plans: [
      {
        id: "landing-solo",
        name: "Страница",
        price: 1900,
        summary: "Одна страница, одна кнопка оплаты, домен третьего уровня.",
      },
    ],
  },
]

/** The service a funnel means when it does not ask ("the single service is implied"). */
export const IMPLIED_SERVICE_ID = "store"
/** What funnel 1 sells outright, with no question asked at all. */
export const DIRECT_PLAN_ID = "store-start"

export type FunnelId = 1 | 2 | 3 | 4

export const FUNNELS: Record<
  FunnelId,
  { title: string; summary: string; steps: string[]; cta: string; href: string }
> = {
  1: {
    title: "Прямая оплата",
    summary: "Ни выбора услуги, ни выбора тарифа — сразу касса. Самая короткая воронка.",
    steps: ["оплата", "онбординг"],
    cta: "Перейти к оплате",
    href: "/start/pay?f=1",
  },
  2: {
    title: "Услуга, затем тариф",
    summary: "Полная воронка: сначала что делаем, потом на каком тарифе.",
    steps: ["услуга", "тариф", "оплата", "онбординг"],
    cta: "Выбрать услугу",
    href: "/start/service?f=2",
  },
  3: {
    title: "Только тариф",
    summary: "Услуга одна и подразумевается. Покупатель выбирает лишь объём.",
    steps: ["тариф", "оплата", "онбординг"],
    cta: "Выбрать тариф",
    href: "/start/plan?f=3",
  },
  4: {
    title: "Только услуга",
    summary: "У каждой услуги один тариф — цена появляется вместе с выбором.",
    steps: ["услуга", "оплата", "онбординг"],
    cta: "Выбрать услугу",
    href: "/start/service?f=4",
  },
}

export function findService(id: string | undefined | null): Service | null {
  if (!id) return null
  return SERVICES.find((s) => s.id === id) ?? null
}

export function findPlan(id: string | undefined | null): { service: Service; plan: Plan } | null {
  if (!id) return null
  for (const service of SERVICES) {
    const plan = service.plans.find((p) => p.id === id)
    if (plan) return { service, plan }
  }
  return null
}

export function parseFunnel(value: string | undefined | null): FunnelId {
  const n = Number(value)
  return n === 1 || n === 2 || n === 3 || n === 4 ? (n as FunnelId) : 1
}

/**
 * What a funnel actually sells once its questions are answered. Returns null
 * when an answer the funnel NEEDS is missing — the caller sends the visitor
 * back to the step that asks it rather than inventing a default, because a
 * silently substituted plan would charge for something nobody chose (rule 20a).
 */
export function resolveOffer(
  funnel: FunnelId,
  serviceId: string | null,
  planId: string | null
): { service: Service; plan: Plan } | null {
  if (funnel === 1) {
    return findPlan(DIRECT_PLAN_ID)
  }

  if (funnel === 2) {
    const found = findPlan(planId)
    if (!found) return null
    // The plan must belong to the service that was picked, or a hand-edited
    // URL could pay the landing price for the pro plan.
    if (serviceId && found.service.id !== serviceId) return null
    return found
  }

  if (funnel === 3) {
    const found = findPlan(planId)
    if (!found || found.service.id !== IMPLIED_SERVICE_ID) return null
    return found
  }

  const service = findService(serviceId)
  if (!service) return null
  const plan = service.plans.find((p) => p.id === service.soloPlanId)
  return plan ? { service, plan } : null
}

export function formatPrice(roubles: number): string {
  return `${roubles.toLocaleString("ru-RU")} ₽`
}
