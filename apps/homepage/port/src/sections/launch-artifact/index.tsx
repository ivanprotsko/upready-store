import styles from "./styles.module.css";
import { plans, stepLabel, type Plan, type PlanFeature } from "./data";

// Icon paths copied verbatim from reference/rendered/02-launch-artifact.html.
// Two stroke colors are used depending on whether the feature is muted
// (the last row of the "оформление" plan, "Возврату не подлежит").
function FeatureIcon({ icon, muted }: { icon: PlanFeature["icon"]; muted?: boolean }) {
  const stroke = muted ? "#A1A1AA" : "#71717A";
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: styles.icon,
  };

  switch (icon) {
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <path d="M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z" />
        </svg>
      );
    case "type":
      return (
        <svg {...common}>
          <path d="M4 6V4h16v2" />
          <path d="M12 4v16" />
          <path d="M9 20h6" />
        </svg>
      );
    case "shield-off":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
          <path d="M4 4l16 16" />
        </svg>
      );
  }
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className={`${styles.card} ${plan.highlighted ? styles.cardHighlighted : ""}`}>
      <div className={styles.cardHeader}>
        <span className={styles.kicker}>{plan.kicker}</span>
        <span className={styles.cardIndex}>{plan.index}</span>
      </div>
      <div className={styles.titleBlock}>
        <h3 className={styles.title}>{plan.title}</h3>
        <p className={styles.description}>{plan.description}</p>
      </div>
      <div className={styles.priceRow}>
        <span className={styles.price}>{plan.price}</span>
        <span className={styles.priceUnit}>{plan.priceUnit}</span>
      </div>
      <ul className={styles.features}>
        {plan.features.map((feature) => (
          <li
            key={feature.text}
            className={`${styles.feature} ${feature.muted ? styles.featureMuted : ""}`}
          >
            <FeatureIcon icon={feature.icon} muted={feature.muted} />
            {feature.text}
          </li>
        ))}
      </ul>
      <a
        href={plan.cta.href}
        target="_blank"
        rel="noopener"
        className={`${styles.cta} ${
          plan.cta.variant === "primary" ? styles.ctaPrimary : styles.ctaOutline
        }`}
      >
        {plan.cta.label}
      </a>
    </div>
  );
}

// No interactive behaviour touches this section in reference/dc-script.js — the grid column
// count (`gridPlans: gfit(300, 2)`) and step counter (`nPlans`) are both static for a 2-plan
// list, see NOTES.md. FeatureIcon/PlanCard are small sub-parts of this one section (co-located
// per the port brief §3.1, which restricts this folder to index.tsx/styles.module.css/data.ts/
// NOTES.md) and are never used outside it.
export default function LaunchArtifact() {
  return (
    <section
      data-section="launch-artifact"
      data-testid="sec-launch-artifact"
      className={styles.section}
    >
      <i className={styles.cornerTopLeft} />
      <i className={styles.cornerTopRight} />

      <div className={styles.stepRow}>
        <span className={styles.stepDot} />
        <span className={styles.stepLabel}>{stepLabel}</span>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => (
          <PlanCard key={plan.index} plan={plan} />
        ))}
      </div>
    </section>
  );
}
