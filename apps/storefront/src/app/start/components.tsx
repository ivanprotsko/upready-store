import type { ReactNode } from "react"
import Link from "next/link"

import styles from "./demo.module.css"

/** The step rail. `current` is 1-based; everything before it reads as done. */
export function Steps({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className={styles.steps} data-testid="demo-steps">
      {labels.map((label, index) => {
        const position = index + 1
        const state =
          position === current ? styles.stepCurrent : position < current ? styles.stepDone : ""
        return (
          <span key={label} style={{ display: "contents" }}>
            <span className={`${styles.step} ${state}`}>
              <span className={styles.stepNumber}>{position}</span>
              {label}
            </span>
            {position < labels.length ? <span className={styles.stepSeparator} /> : null}
          </span>
        )
      })}
    </div>
  )
}

export function Lede({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.lede}>
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </div>
  )
}

/** The funnel chain shown on a showcase card: `услуга → тариф → оплата`. */
export function Chain({ steps }: { steps: string[] }) {
  return (
    <div className={styles.chain}>
      {steps.map((step, index) => (
        <span key={step} style={{ display: "contents" }}>
          <span className={styles.chip}>{step}</span>
          {index < steps.length - 1 ? <span className={styles.arrow}>→</span> : null}
        </span>
      ))}
    </div>
  )
}

/**
 * One choice in a picker, as a LINK: every step of every funnel is a real URL,
 * so a person can be handed the middle of a funnel and land exactly there, and
 * the back button works without a state machine.
 */
export function OptionLink({
  href,
  title,
  summary,
  price,
  selected,
  testId,
}: {
  href: string
  title: string
  summary: string
  price?: string
  selected?: boolean
  testId?: string
}) {
  return (
    <Link
      className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
      href={href}
      data-testid={testId}
    >
      <span className={styles.radio} />
      <span className={styles.optionBody}>
        <strong>{title}</strong>
        <span>{summary}</span>
      </span>
      {price ? <span className={styles.price}>{price}</span> : null}
    </Link>
  )
}
