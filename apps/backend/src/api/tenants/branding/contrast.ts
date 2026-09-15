/**
 * WCAG contrast math for the owner's chosen primary colour (t16-owner-branding,
 * step 4). The rule is not "reject the colour" — the owner's choice is never
 * silently overridden — it is "tell the truth about it": the panel shows a
 * warning when even the better of white/black text fails WCAG AA (4.5:1) on
 * top of the colour the owner picked, and the storefront always uses whichever
 * of white/black actually reads, the same way the theme presets already pick
 * `--primary-foreground` per preset.
 */

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export const isValidHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_RE.test(value);

const srgbToLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const relativeLuminance = (hex: string): number => {
  const match = HEX_RE.exec(hex);

  if (!match) {
    return 0;
  }

  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;

  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
};

/** WCAG's own formula: (L1 + 0.05) / (L2 + 0.05), lighter over darker. */
export const contrastRatio = (hexA: string, hexB: string): number => {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);

  return (lighter + 0.05) / (darker + 0.05);
};

/** Whichever of white/black text contrasts better against `hex`. */
export const bestForeground = (hex: string): "#ffffff" | "#000000" =>
  contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000") ? "#ffffff" : "#000000";

/**
 * The threshold the warning fires on. NOT WCAG AA's normal-text 4.5:1 — that
 * bound is unreachable as a *failure* once the foreground is auto-picked as
 * the better of black/white: for any background colour, max(contrast against
 * black, contrast against white) is at least ~4.608:1 (measured by sweeping
 * every grayscale value; the minimum sits at #757575, where black and white
 * text tie). A 4.5 threshold would therefore never warn, on any colour —
 * dead code disguised as a feature. WCAG AAA's 7:1 is the bound that actually
 * separates "fine" from "the owner picked a medium-saturated colour that is
 * hard to put any text on", which is the real complaint this warning exists
 * to catch.
 */
export const CONTRAST_WARNING_THRESHOLD = 7;

/** True when even the better foreground stays below the warning threshold. */
export const isLowContrast = (hex: string): boolean =>
  contrastRatio(hex, bestForeground(hex)) < CONTRAST_WARNING_THRESHOLD;
