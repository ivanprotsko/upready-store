"use client"

import { useState } from "react"
import type { CSSProperties } from "react"

import type { PricingDocument } from "@lib/platform-pricing/types"
import { typo } from "@lib/platform-pricing/typo"

import { LineIcon } from "./icons"
import styles from "./pricing.module.css"
import { TipTrigger, type TipAvailability } from "./tips"

/**
 * The comparison table of `oksana-3tier-pricing.html`: a sticky header on wide
 * screens, and below 880px a sticky row of tabs that shows the features next to
 * ONE chosen tariff. The chosen tab is the only state; the first tariff is
 * chosen on the server render, as in the file.
 */
export function Comparison({ pricing }: { pricing: PricingDocument }) {
  const [active, setActive] = useState(0)
  const { tiers, sections } = pricing
  const grid = { "--cols": tiers.length + 1, "--tiers": tiers.length } as CSSProperties

  return (
    <section className={styles.cmpSec} style={grid}>
      <div className={styles.tabs} role="tablist" data-testid="pricing-tabs">
        {tiers.map((tier, i) => (
          <button
            key={tier.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`${styles.tab} ${i === active ? styles.active : ""}`}
            onClick={() => setActive(i)}
          >
            {typo(tier.short_name || tier.name)}
            <span className={styles.tp}>{typo(tier.price)}</span>
          </button>
        ))}
      </div>

      <div className={styles.cmpTable} data-testid="pricing-table">
        <div className={styles.cmpHead}>
          <div className={`${styles.hcell} ${styles.hcellFeat}`}>{typo(pricing.features_label)}</div>
          {tiers.map((tier) => (
            <div className={styles.hcell} key={tier.id}>
              {typo(tier.name)}
            </div>
          ))}
        </div>

        {sections.map((section, s) => (
          <div key={s}>
            {s > 0 ? <div className={styles.rowRule} /> : null}
            <div className={styles.cmpIntro}>
              <div className={styles.eb}>
                <LineIcon name={section.icon} />
                {typo(section.eyebrow)}
              </div>
              <h2 className={styles.cmpHeading}>{typo(section.heading)}</h2>
              {section.chips.length > 0 ? (
                <div className={styles.platStrip}>
                  {section.chips.map((chip, c) => (
                    <span className={styles.chip} key={c}>
                      {typo(chip)}
                    </span>
                  ))}
                  {section.more_chip ? (
                    <span className={`${styles.chip} ${styles.chipMore}`}>{typo(section.more_chip)}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className={styles.cmpRows}>
              {section.rows.map((row, r) => {
                const availability: TipAvailability[] = tiers.map((tier) => {
                  const value = row.values[tier.id]
                  return value?.type === "text"
                    ? { tier: tier.name, kind: "text", text: typo(value.text) }
                    : { tier: tier.name, kind: value?.type === "yes" ? "yes" : "no", text: "" }
                })
                return (
                  <div key={r}>
                    {r > 0 ? <div className={styles.rowRule} /> : null}
                    <div className={styles.crow}>
                      <TipTrigger
                        as="div"
                        id={`row-${s}-${r}`}
                        className={`${styles.cell} ${styles.cellFeat}`}
                        title={typo(row.feature)}
                        tip={row.tip}
                        availability={availability}
                      >
                        {typo(row.feature)}
                      </TipTrigger>
                      {tiers.map((tier, i) => {
                        const value = row.values[tier.id]
                        const cls = `${styles.cell} ${styles.cellVal} ${i === active ? styles.cellActive : ""}`
                        if (value?.type === "yes") {
                          return (
                            <div className={cls} key={tier.id}>
                              <span className={styles.yes}>✓</span>
                            </div>
                          )
                        }
                        if (value?.type === "text") {
                          return (
                            <div className={cls} key={tier.id}>
                              <span className={styles.txt}>{typo(value.text)}</span>
                            </div>
                          )
                        }
                        return (
                          <div className={cls} key={tier.id}>
                            <span className={styles.no}>–</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
