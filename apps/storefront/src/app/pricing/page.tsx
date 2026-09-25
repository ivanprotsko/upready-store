import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { notFound } from "next/navigation"

import { getPlatformPricing } from "@lib/data/platform-pricing"
import { pricingButtonHref } from "@lib/platform-pricing/actions"
import type { PricingButton } from "@lib/platform-pricing/types"
import { typo } from "@lib/platform-pricing/typo"

import { Comparison } from "./comparison"
import { CheckMark, LineIcon, StarIcon } from "./icons"
import styles from "./pricing.module.css"
import { RichText } from "./rich-text"
import { TipProvider, TipTrigger } from "./tips"

/**
 * The platform's pricing page (t-2026-09-25-08), the table of Ivan's
 * `oksana-3tier-pricing.html` with every text read from the backend
 * (`GET /platform/pricing`, edited in the admin at «Тарифы»).
 *
 * It lives OUTSIDE `[locale]`, like `/start`: it is served on the platform
 * hosts (`DEMO_HOSTS`), which resolve to no tenant and have no publishable key,
 * and the middleware lets `/pricing` through there. A shop's host never reaches
 * this file: the middleware sends its `/pricing` into `[locale]` as before.
 *
 * Dynamic on every request (the read is `no-store`), so an admin save shows on
 * the next load without a rebuild.
 */
export const dynamic = "force-dynamic"

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-pricing-inter",
})

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPlatformPricing()
  return payload ? { title: payload.pricing.page.meta_title } : {}
}

function ButtonLink({
  button,
  tierId,
  testId,
}: {
  button: PricingButton
  tierId: string | null
  testId: string
}) {
  return (
    <a
      className={`${styles.btn} ${button.style === "solid" ? styles.btnSolid : ""}`}
      href={pricingButtonHref(button.action, tierId)}
      data-testid={testId}
      data-action={button.action.type}
    >
      {typo(button.label)}
    </a>
  )
}

export default async function PricingPage() {
  const payload = await getPlatformPricing()

  if (!payload) {
    notFound()
  }

  const { pricing } = payload
  const { page, tiers, final } = pricing

  return (
    <div className={`${inter.variable} ${styles.page}`} data-testid="pricing-page">
      <TipProvider drawer={pricing.drawer}>
        <div className={styles.frame}>
          <div className={styles.rule} />

          <div className={styles.shell}>
            <header className={styles.hero}>
              <div className={styles.heroInner}>
                {page.eyebrow ? (
                  <span className={styles.eyebrow}>
                    <StarIcon className={styles.eyebrowMark} />
                    <RichText text={page.eyebrow} />
                  </span>
                ) : null}
                <div className={styles.heroRow}>
                  <h1 className={styles.title}>
                    <RichText text={page.title} />
                  </h1>
                  {page.note ? (
                    <p className={styles.heroNote}>
                      <RichText text={page.note} />
                    </p>
                  ) : null}
                </div>
              </div>
            </header>
          </div>

          <div className={styles.rule} />

          <div className={styles.shell}>
            <section className={styles.cards} data-testid="pricing-cards">
              {tiers.map((tier) => (
                <div className={styles.card} key={tier.id} data-tier={tier.id}>
                  <div className={styles.cardHead}>
                    <h2 className={styles.tier}>{typo(tier.name)}</h2>
                    <div className={styles.priceline}>
                      <span className={styles.amt}>{typo(tier.price)}</span>
                      {tier.price_note ? ` ${typo(tier.price_note)}` : null}
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <p className={styles.desc}>{typo(tier.description)}</p>
                    {tier.plus ? <div className={styles.plus}>{typo(tier.plus)}</div> : null}
                    <ul className={styles.feat}>
                      {tier.features.map((feature, f) => (
                        <TipTrigger
                          key={f}
                          as="li"
                          id={`card-${tier.id}-${f}`}
                          title={typo(feature.text)}
                          tip={feature.tip}
                          before={<CheckMark className={styles.ck} />}
                        >
                          {typo(feature.text)}
                        </TipTrigger>
                      ))}
                    </ul>
                    <ButtonLink button={tier.button} tierId={tier.id} testId={`pricing-cta-${tier.id}`} />
                  </div>
                </div>
              ))}
            </section>
          </div>

          <div className={styles.rule} />

          {pricing.highlights.length > 0 ? (
            <>
              <div className={styles.shell}>
                <section className={styles.highlights}>
                  <div className={styles.hlGrid}>
                    {pricing.highlights.map((item, i) => (
                      <div className={styles.hlItem} key={i}>
                        <div className={styles.hlHead}>
                          <LineIcon name={item.icon} />
                          <span className={styles.hlLabel}>
                            <RichText text={item.label} />
                          </span>
                        </div>
                        <p className={styles.hlDesc}>
                          <RichText text={item.text} />
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className={styles.rule} />
            </>
          ) : null}

          <div className={styles.shell} id="cmp">
            <Comparison pricing={pricing} />
          </div>

          <div className={styles.rule} />

          {pricing.explainers.length > 0 ? (
            <>
              <div className={styles.shell}>
                <section className={styles.foot}>
                  <div className={styles.footGrid}>
                    {pricing.explainers.map((box, i) => (
                      <div className={styles.fbox} key={i}>
                        <h3>
                          <RichText text={box.title} />
                        </h3>
                        <p>
                          <RichText text={box.text} />
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <div className={styles.rule} />
            </>
          ) : null}

          <section className={styles.ctaBand} id="final">
            <div className={styles.shell}>
              <div className={styles.ctaInner}>
                <div className={styles.ctaLeft}>
                  <h2>
                    <RichText text={final.title} />
                  </h2>
                  {final.text ? (
                    <p>
                      <RichText text={final.text} />
                    </p>
                  ) : null}
                </div>
                <div className={styles.ctaRight}>
                  <ButtonLink button={final.button} tierId={final.tier_id} testId="pricing-cta-final" />
                </div>
              </div>
            </div>
          </section>

          <div className={styles.rule} />
        </div>

        <div className={styles.pagepad} />
      </TipProvider>
    </div>
  )
}
