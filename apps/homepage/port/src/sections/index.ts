import type { ComponentType, ReactNode } from "react";

import Shell from "./shell/index";
import Hero from "./hero/index";
import LaunchArtifact from "./launch-artifact/index";
import SocialProof from "./social-proof/index";
import ProofFull from "./proof-full/index";
import ProofShort from "./proof-short/index";
import Frame from "./frame/index";
import Included from "./included/index";
import Operations from "./operations/index";
import Pricing from "./pricing/index";
import Payments from "./payments/index";
import Delivery from "./delivery/index";
import Showcase from "./showcase/index";
import Faq from "./faq/index";
import Tariffs from "./tariffs/index";
import FinalCta from "./final-cta/index";

/**
 * Section registry — DOM order, frozen by
 * artifacts/docs/2026-09-12-homepage-landing-port-brief.md §2.
 * Section agents own their own folder only; this file is merger-owned.
 */
/**
 * Props every registry component may receive from App.tsx.
 *
 * `num` is the page-wide ordinal from dc-script.js's `order`/`num` counter
 * (lines 319-322): it changes with the shared `show*` block flags, so it
 * cannot be computed inside a section. A section that prints an eyebrow
 * number accepts it and falls back to the literal its own data.ts carries
 * (the value the reference capture froze), which is what keeps the isolated
 * `?section=<slug>` preview identical to `reference/shots/<slug>.png`.
 */
export interface SectionProps {
  num?: string;
  children?: ReactNode;
}

export interface SectionEntry {
  /** frozen slug, also the folder name under src/sections/ */
  slug: string;
  /** data-screen-label from the legacy page */
  label: string;
  /** legacy anchor id, when the section had one (nav anchors target these) */
  id?: string;
  /** default export of ./<slug>/index.tsx */
  Component: ComponentType<SectionProps>;
}

export const sections: SectionEntry[] = [
  { slug: "shell", label: "Nav + Footer («Подвал»)", Component: Shell },
  { slug: "hero", label: "Первый экран", Component: Hero },
  { slug: "launch-artifact", label: "Артефакт: запуск", Component: LaunchArtifact },
  { slug: "social-proof", label: "Кто уже на этой системе", Component: SocialProof },
  { slug: "proof-full", label: "Почему это про вас", id: "proof-full", Component: ProofFull },
  { slug: "proof-short", label: "Почему это про вас — коротко", Component: ProofShort },
  { slug: "frame", label: "Рамка", Component: Frame },
  { slug: "included", label: "Что входит", id: "sec-included", Component: Included },
  { slug: "operations", label: "Операции", Component: Operations },
  { slug: "pricing", label: "Цены", id: "sec-pricing", Component: Pricing },
  { slug: "payments", label: "Оплата", id: "sec-payments", Component: Payments },
  { slug: "delivery", label: "Доставка", id: "sec-delivery", Component: Delivery },
  { slug: "showcase", label: "Примеры магазинов", id: "sec-showcase", Component: Showcase },
  { slug: "faq", label: "Вопросы", id: "sec-faq", Component: Faq },
  { slug: "tariffs", label: "Тарифы", id: "sec-tariffs", Component: Tariffs },
  { slug: "final-cta", label: "Финальный призыв", Component: FinalCta },
];
