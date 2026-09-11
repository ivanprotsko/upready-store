import { NextResponse, type NextRequest } from "next/server"

import { classifyDemoCard, isDemoCardComplete, type DemoCardValue } from "@lib/demo-card"
import { parseFunnel, resolveOffer } from "@lib/demo/catalog"
import { PAID_COOKIE } from "@lib/demo/paid"

/**
 * The demo till (t-2026-09-12-paywall-onboarding-demo). No money, no provider,
 * no webhook — the outcome is decided by the SAME documented suffix rules the
 * five stands use, and the only durable effect is the cookie below.
 *
 * The classification runs HERE and not only in the browser: the cookie is what
 * lets the onboarding screen say "оплачено", so a client that never opened the
 * till must not be able to set it. The rules live in `@lib/demo-card`, a module
 * with no `"use client"` on it — importing them from the checkout component
 * would hand this route a client reference, not a function (rule 19g).
 */
type Body = {
  funnel?: number | string
  serviceId?: string
  planId?: string
  card?: DemoCardValue
  confirmed?: boolean
}

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ message: "Тело запроса не разобрано." }, { status: 400 })
  }

  const funnel = parseFunnel(String(body.funnel ?? ""))
  const offer = resolveOffer(funnel, body.serviceId ?? null, body.planId ?? null)

  if (!offer) {
    return NextResponse.json(
      { message: "Этот сценарий не собран до конца — вернитесь к выбору." },
      { status: 400 }
    )
  }

  const card = body.card
  if (!card || !isDemoCardComplete(card)) {
    return NextResponse.json({ message: "Данные карты неполные." }, { status: 400 })
  }

  const outcome = classifyDemoCard(card)

  if (outcome === "decline") {
    return NextResponse.json({ outcome: "decline" })
  }

  // `9999` is the documented "the bank wants a confirmation" number. The first
  // call reports it; the SECOND call, the one the confirm button makes, is the
  // one that pays. Reported rather than silently approved, because the whole
  // point of the stand is that Ivan sees the branch.
  if (outcome === "redirect" && !body.confirmed) {
    return NextResponse.json({ outcome: "redirect" })
  }

  const response = NextResponse.json({ outcome: "approve" })
  response.cookies.set(PAID_COOKIE, JSON.stringify({
    funnel,
    serviceId: offer.service.id,
    planId: offer.plan.id,
    price: offer.plan.price,
    at: new Date().toISOString(),
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 6,
  })
  return response
}
