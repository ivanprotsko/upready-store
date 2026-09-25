"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import styles from "../demo.module.css"
import {
  EMPTY_DEMO_CARD,
  cardNumberError,
  cvcValid,
  expiryValid,
  formatCardNumber,
  formatCvc,
  formatExpiry,
  isDemoCardComplete,
} from "@lib/demo-card"

type Outcome = "decline" | "redirect" | "approve"

/**
 * The demo till's form. It gates the button with the SAME pure rules the five
 * stands use (`@lib/demo-card`), but the verdict that matters is the server's:
 * `/api/demo/pay` classifies the number again and only it may mark the funnel
 * paid, because a client that never asked could otherwise walk straight into
 * onboarding.
 */
export default function PayForm(
  props:
    | { funnel: number; serviceId: string; planId: string; amountLabel: string }
    // Entered from a pricing button (t-2026-09-25-08): the tariff and, for a
    // card trial, its length travel instead of a funnel's answers.
    | { tariff: { id: string; trialDays: number | null }; submitLabel: string }
) {
  const router = useRouter()
  const [card, setCard] = useState(EMPTY_DEMO_CARD)
  const [holder, setHolder] = useState("")
  const [numberTouched, setNumberTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // The wizard is told which tariff it opens a shop for; the old funnels
  // carry theirs in the paid cookie and go to the bare address as before.
  const onboardingHref =
    "tariff" in props
      ? `/start/onboarding?${new URLSearchParams({
          tariff: props.tariff.id,
          ...(props.tariff.trialDays !== null ? { trial: String(props.tariff.trialDays) } : {}),
        })}`
      : "/start/onboarding"
  const submitLabel = "tariff" in props ? props.submitLabel : `Оплатить ${props.amountLabel}`

  const numberError = numberTouched ? cardNumberError(card.number) : null
  const complete = isDemoCardComplete(card)

  async function submit(confirmed: boolean) {
    setBusy(true)
    setFailure(null)
    try {
      const offer =
        "tariff" in props
          ? { tariff: props.tariff.id, trialDays: props.tariff.trialDays }
          : { funnel: props.funnel, serviceId: props.serviceId, planId: props.planId }
      const response = await fetch("/api/demo/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...offer, card, confirmed }),
      })
      const body = (await response.json()) as { outcome?: Outcome; message?: string }

      if (!response.ok || !body.outcome) {
        // Tolerating a failure is not hiding it (rule 20): the person waiting
        // sees it, and the browser console keeps the detail.
        console.error("demo pay failed", response.status, body)
        setFailure(body.message ?? `Касса ответила ${response.status}. Попробуйте ещё раз.`)
        return
      }

      setOutcome(body.outcome)
      if (body.outcome === "approve") {
        router.push(onboardingHref)
      }
    } catch (error) {
      console.error("demo pay failed", error)
      setFailure("Касса не ответила. Проверьте соединение и попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="demo-pay-form">
      {outcome === "decline" ? (
        <div className={`${styles.banner} ${styles.bannerError}`} data-testid="demo-pay-declined">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>
            <strong>Платёж отклонён.</strong> Банк не подтвердил операцию по этой карте. Попробуйте
            другую — например <code>4242 4242 4242 4242</code>.
          </span>
        </div>
      ) : null}

      {outcome === "redirect" ? (
        <div className={styles.banner} data-testid="demo-pay-3ds">
          <span className={styles.dot} />
          <span>
            Банк запросил подтверждение операции. В настоящей кассе здесь была бы страница банка;
            на стенде — кнопка ниже.
          </span>
        </div>
      ) : null}

      {failure ? (
        <div className={`${styles.banner} ${styles.bannerError}`} data-testid="demo-pay-failure">
          <span className={`${styles.dot} ${styles.dotError}`} />
          <span>{failure}</span>
        </div>
      ) : null}

      <div className={styles.banner}>
        <span className={styles.dot} />
        <span>
          Тестовая касса, деньги не списываются. Номер, оканчивающийся на <code>0000</code>, платёж
          отклоняет; на <code>9999</code> — уводит на подтверждение банка; любой валидный по Луну
          проходит, например <code>4242 4242 4242 4242</code>.
        </span>
      </div>

      <div className={styles.field}>
        <label htmlFor="demo-card-number">Номер карты</label>
        <input
          id="demo-card-number"
          className={`${styles.input} ${styles.inputMono} ${numberError ? styles.inputInvalid : ""}`}
          inputMode="numeric"
          autoComplete="cc-number"
          value={card.number}
          onBlur={() => setNumberTouched(true)}
          onChange={(event) =>
            setCard({ ...card, number: formatCardNumber(event.target.value) })
          }
          placeholder="4242 4242 4242 4242"
        />
        {numberError ? (
          <span className={`${styles.hint} ${styles.hintError}`}>
            Номер не похож на карту: 13–19 цифр и проверка Луна.
          </span>
        ) : null}
      </div>

      <div className={styles.row2}>
        <div className={styles.field}>
          <label htmlFor="demo-card-expiry">Срок действия</label>
          <input
            id="demo-card-expiry"
            className={`${styles.input} ${styles.inputMono} ${
              card.expiry && !expiryValid(card.expiry) ? styles.inputInvalid : ""
            }`}
            inputMode="numeric"
            autoComplete="cc-exp"
            value={card.expiry}
            onChange={(event) => setCard({ ...card, expiry: formatExpiry(event.target.value) })}
            placeholder="12 / 30"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="demo-card-cvc">CVC</label>
          <input
            id="demo-card-cvc"
            className={`${styles.input} ${styles.inputMono} ${
              card.cvc && !cvcValid(card.cvc) ? styles.inputInvalid : ""
            }`}
            inputMode="numeric"
            autoComplete="cc-csc"
            value={card.cvc}
            onChange={(event) => setCard({ ...card, cvc: formatCvc(event.target.value) })}
            placeholder="123"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="demo-card-holder">Имя на карте</label>
        <input
          id="demo-card-holder"
          className={styles.input}
          autoComplete="cc-name"
          value={holder}
          onChange={(event) => setHolder(event.target.value)}
          placeholder="IVAN PROTSKO"
        />
      </div>

      {outcome === "redirect" ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge} ${styles.btnBlock}`}
          disabled={busy}
          onClick={() => submit(true)}
          data-testid="demo-pay-confirm"
        >
          {busy ? "Подтверждаем…" : "Подтвердить в банке"}
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLarge} ${styles.btnBlock}`}
          disabled={!complete || busy}
          onClick={() => submit(false)}
          data-testid="demo-pay-submit"
        >
          {busy ? "Проводим платёж…" : submitLabel}
        </button>
      )}
    </div>
  )
}
