import { useEffect, useState } from "react";

import PageShell from "./PageShell";
import { sections } from "./sections";
import { Footer, Nav } from "./sections/shell/index";

/**
 * App.tsx — merger-owned assembly (brief §4).
 *
 * Holds the two things no single section can own:
 *   1. the shared visibility state (`state.blocks` in
 *      `reference/dc-script.js` line 2) plus the audience, which together
 *      decide which sections render at all;
 *   2. the page-wide ordinal counter (`order`/`num`, dc-script.js lines
 *      319-322) that produces each section's eyebrow number.
 * The page chrome itself lives in ./PageShell.tsx.
 */

export type Audience = "cold" | "warm" | "price";

/** `state.blocks` — dc-script.js line 2. */
export interface Blocks {
  proof: boolean;
  frame: boolean;
  included: boolean;
  pricing: boolean;
  faq: boolean;
}

/**
 * Defaults.
 *
 * `reference/props.json` declares exactly three page props —
 * `defaultAudience` (default `"cold"`), `showTodoMarkers` (default `true`)
 * and `accentColor`. It carries NO `show*` key: the five block flags are
 * component state, not props, and dc-script.js line 2 initialises every one
 * of them to `false`. Measured on the live reference render
 * (http://localhost:4790/index.html, 2026-09-13): nine sections render —
 * hero, launch-artifact, social-proof, operations, payments, delivery,
 * showcase, tariffs, final-cta — numbered 01…07, with proof/frame/included/
 * pricing/faq absent. These defaults reproduce exactly that page.
 */
export const DEFAULT_AUDIENCE: Audience = "cold";
export const DEFAULT_BLOCKS: Blocks = {
  proof: false,
  frame: false,
  included: false,
  pricing: false,
  faq: false,
};
/** `showTodoMarkers` — reference/props.json default. Sections currently keep
 * their own copy of it; this is the page-level source of truth for it. */
export const SHOW_TODO_MARKERS = true;

const AUDIENCE_IDS: Audience[] = ["cold", "warm", "price"];

/** Port of `resolveAudience()` + `persist()` (dc-script.js lines 89-108). */
export function resolveAudience(def: Audience = DEFAULT_AUDIENCE): Audience {
  let v: string | null = null;
  try {
    const q = new URLSearchParams(window.location.search);
    v = q.get("v") || q.get("utm_content");
    if (!v) {
      const raw = window.sessionStorage.getItem("upready_v");
      if (raw) {
        const s = JSON.parse(raw) as { v?: string; t?: number };
        if (s && typeof s.t === "number" && Date.now() - s.t < 30 * 60 * 1000) {
          v = s.v ?? null;
        }
      }
    }
  } catch {
    v = null;
  }
  const a = AUDIENCE_IDS.includes(v as Audience) ? (v as Audience) : def;
  try {
    window.sessionStorage.setItem("upready_v", JSON.stringify({ v: a, t: Date.now() }));
  } catch {
    /* private mode / storage disabled — the legacy page swallows this too */
  }
  return a;
}

/**
 * Port of the `order`/`num` counter (dc-script.js lines 319-322): each block
 * that is switched on takes the next two-digit ordinal. Keys are the legacy
 * block names, not the port's slugs.
 */
export function pageNumbers(blocks: Blocks): Record<string, string> {
  const order: [string, boolean][] = [
    ["plans", true],
    ["logos", true],
    ["proof", blocks.proof],
    ["frame", blocks.frame],
    ["included", blocks.included],
    ["ops", true],
    ["pricing", blocks.pricing],
    ["payments", true],
    ["delivery", true],
    ["showcase", true],
    ["faq", blocks.faq],
    ["tariffs", true],
  ];
  const num: Record<string, string> = {};
  let ni = 0;
  for (const [k, on] of order) {
    if (on) {
      ni += 1;
      num[k] = String(ni).padStart(2, "0");
    }
  }
  return num;
}

/** slug → the `num` key whose ordinal that section prints in its eyebrow. */
const NUM_KEY: Record<string, string> = {
  "launch-artifact": "plans",
  "social-proof": "logos",
  "proof-full": "proof",
  frame: "frame",
  included: "included",
  operations: "ops",
  pricing: "pricing",
  payments: "payments",
  delivery: "delivery",
  showcase: "showcase",
  faq: "faq",
  tariffs: "tariffs",
};

/**
 * Visibility, from `renderVals()` (dc-script.js lines 339-340):
 *   showProofFull  = audience === 'cold' && blocks.proof
 *   showProofShort = audience === 'warm' && blocks.proof
 *   showFrame/showIncluded/showPricing/showFaq = the matching block flag
 * Every other section is unconditional.
 */
export function isSectionVisible(slug: string, blocks: Blocks, audience: Audience): boolean {
  switch (slug) {
    case "proof-full":
      return audience === "cold" && blocks.proof;
    case "proof-short":
      return audience === "warm" && blocks.proof;
    case "frame":
      return blocks.frame;
    case "included":
      return blocks.included;
    case "pricing":
      return blocks.pricing;
    case "faq":
      return blocks.faq;
    default:
      return true;
  }
}

export default function App() {
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  /* One piece of state for the five shared `show*` flags (brief §4). Nothing
   * in the port toggles them: the legacy admin panel is out of scope. */
  const [blocks] = useState<Blocks>(DEFAULT_BLOCKS);

  useEffect(() => {
    setAudience(resolveAudience());
  }, []);

  const num = pageNumbers(blocks);
  const content = sections.filter((s) => s.slug !== "shell");

  return (
    <PageShell
      nav={
        <Nav
          showIncluded={blocks.included}
          showPricing={blocks.pricing}
          showFaq={blocks.faq}
        />
      }
    >
      {content
        .filter((s) => isSectionVisible(s.slug, blocks, audience))
        .map(({ slug, Component }) => {
          const key = NUM_KEY[slug];
          return <Component key={slug} num={key ? num[key] : undefined} />;
        })}
      <Footer />
    </PageShell>
  );
}
