/**
 * The typographer of Ivan's `oksana-3tier-pricing.html`, ported as is: the
 * page's tier, section, row, chip and tooltip texts are stored with plain
 * spaces and set here, exactly as that file's own `typo()` set them.
 *
 *   - a narrow no-break space (U+202F) in digit groups and before ₽ $ €;
 *   - a no-break space before a spaced em dash;
 *   - a no-break space after a short preposition, conjunction or particle.
 *
 * Page texts (hero, value blocks, explainers, final block) do NOT go through
 * here: they keep the non-breaking spaces they were written with, as in the
 * file's markup.
 */

const SHORT = [
  "из-за", "из-под", "во", "со", "ко", "об", "изо", "при", "что", "как", "или", "для", "про",
  "над", "без", "не", "но", "да", "же", "бы", "ли", "то", "в", "и", "с", "к", "о", "у", "а",
  "я", "на", "за", "по", "под", "от", "до", "из",
]

const SHORT_WORD = new RegExp(`(^|[\\s(«"])(${SHORT.join("|")}) +`, "gi")

export function typo(input: string | null | undefined): string {
  let s = String(input ?? "")
  s = s.replace(/(\d)[ \u00a0\u202f]+(?=\d{3}(?:[ \u00a0\u202f]|\D|$))/g, "$1\u202f")
  s = s.replace(/(\d)[ \u00a0\u202f]+(?=[₽$€])/g, "$1\u202f")
  s = s.replace(/\u00a0/g, " ")
  s = s.replace(/(\S) +— +/g, "$1\u00a0— ")
  // Twice, as in the file: one pass cannot bind two short words in a row
  // («и в»), because the first match eats the space the second one starts at.
  s = s.replace(SHORT_WORD, (_m, p: string, w: string) => `${p}${w}\u00a0`)
  s = s.replace(SHORT_WORD, (_m, p: string, w: string) => `${p}${w}\u00a0`)
  return s
}
