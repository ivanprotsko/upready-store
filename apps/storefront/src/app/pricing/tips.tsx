"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import type { PricingDocument } from "@lib/platform-pricing/types"

import styles from "./pricing.module.css"

/** One tariff's line in the drawer's «В каком тарифе» list. */
export type TipAvailability = { tier: string; kind: "yes" | "no" | "text"; text: string }

type OpenTip = {
  id: string
  title: string
  tip: string
  availability: TipAvailability[] | null
}

type TipContextValue = {
  current: string | null
  toggle: (tip: OpenTip) => void
}

const TipContext = createContext<TipContextValue | null>(null)

/** The feature text as the drawer's heading: its non-breaking spaces made plain. */
function plain(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * The side drawer a dashed-underlined feature opens, as in
 * `oksana-3tier-pricing.html`: the feature, its explanation and, for a row of
 * the comparison table, what each tariff has. Its own words come from the
 * pricing document (`drawer`). Escape, the overlay and × close it; a second
 * click on the same feature does too.
 */
export function TipProvider({
  drawer,
  children,
}: {
  drawer: PricingDocument["drawer"]
  children: ReactNode
}) {
  const [open, setOpen] = useState<OpenTip | null>(null)
  const [shown, setShown] = useState<OpenTip | null>(null)

  const close = useCallback(() => setOpen(null), [])
  const toggle = useCallback((tip: OpenTip) => {
    setOpen((current) => (current?.id === tip.id ? null : tip))
    setShown(tip)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(() => ({ current: open?.id ?? null, toggle }), [open, toggle])

  return (
    <TipContext.Provider value={value}>
      {children}
      <div
        className={`${styles.drwOverlay} ${open ? styles.open : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className={`${styles.drw} ${open ? styles.open : ""}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={open ? undefined : true}
        data-testid="pricing-drawer"
      >
        <div className={styles.drwHead}>
          <div className={styles.htext}>
            <p className={styles.drwEyebrow}>{drawer.eyebrow}</p>
            <h3>{shown ? plain(shown.title) : null}</h3>
          </div>
          <button
            className={styles.drwX}
            type="button"
            aria-label={drawer.close_label}
            onClick={close}
            tabIndex={open ? 0 : -1}
          >
            &times;
          </button>
        </div>
        <div className={styles.drwBody}>
          <p>{shown?.tip}</p>
          {shown?.availability ? (
            <div className={styles.drwAvail}>
              <p className={styles.lab}>{drawer.availability_label}</p>
              {shown.availability.map((line) => (
                <div className={styles.arow} key={line.tier}>
                  <span className={styles.nm}>{line.tier}</span>
                  {line.kind === "yes" ? (
                    <span className={styles.mkYes}>{drawer.yes_label}</span>
                  ) : line.kind === "no" ? (
                    <span className={styles.mkNo}>{drawer.no_label}</span>
                  ) : (
                    <span className={styles.mkTxt}>{line.text}</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    </TipContext.Provider>
  )
}

/**
 * A feature that opens the drawer. Without a tip it is plain text, exactly as
 * the file left a feature with no entry in its `tips`.
 */
export function TipTrigger({
  as: Tag,
  id,
  className,
  title,
  tip,
  availability = null,
  before,
  children,
}: {
  as: "li" | "div"
  id: string
  className?: string
  title: string
  tip: string
  availability?: TipAvailability[] | null
  before?: ReactNode
  children: ReactNode
}) {
  const context = useContext(TipContext)
  if (!context) {
    throw new Error("TipTrigger is rendered outside TipProvider")
  }

  if (!tip) {
    return (
      <Tag className={className}>
        {before}
        {children}
      </Tag>
    )
  }

  const on = context.current === id
  return (
    <Tag
      className={`${className ?? ""} ${styles.tipable} ${on ? styles.on : ""}`}
      data-tipkey={plain(title)}
      role="button"
      tabIndex={0}
      aria-expanded={on}
      onClick={(event) => {
        event.stopPropagation()
        context.toggle({ id, title, tip, availability })
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          context.toggle({ id, title, tip, availability })
        }
      }}
    >
      {before}
      <span className={styles.uline}>{children}</span>
    </Tag>
  )
}
