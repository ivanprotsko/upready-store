// Contrast table for the `womens-fashion` (Larchant) preset, both modes.
//
// A ratio nobody computed is not a ratio, so section 3.3 of style-board.md is the OUTPUT of
// this file, pasted, not retyped. WCAG 2.1 relative luminance, sRGB, no rounding until print.
//
//   node design/contrast.mjs            table for both modes
//   node design/contrast.mjs --check    exit 1 if any REQUIRED pair is under its floor
//
// This measures the FILE. It is arithmetic on JSON and proves only that the values are
// self-consistent; the pairs that matter are re-measured from computed styles on the live
// stand (W4/W6) and by the coverage gate, which reads pixels.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const theme = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'theme.json'), 'utf8'))

const srgb = (hex) => {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
}
const lum = (hex) =>
  srgb(hex)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// [foreground, background, floor, what it paints]
const PAIRS = [
  ['--foreground', '--background', 4.5, 'body copy on the page'],
  ['--card-foreground', '--card', 4.5, 'copy on a product card'],
  ['--popover-foreground', '--popover', 4.5, 'copy in a dropdown or drawer'],
  ['--primary-foreground', '--primary', 4.5, 'label inside the primary button'],
  ['--secondary-foreground', '--secondary', 4.5, 'label inside the secondary button'],
  ['--muted-foreground', '--muted', 4.5, 'helper text on a muted panel'],
  ['--muted-foreground', '--background', 4.5, 'helper text on the page'],
  ['--accent-foreground', '--accent', 4.5, 'label inside the accent chip'],
  ['--accent', '--background', 4.5, 'the accent as text: sale price, active swatch label'],
  ['--destructive-foreground', '--destructive', 4.5, 'label inside a destructive button'],
  ['--destructive', '--background', 4.5, 'error text on the page'],
  ['--link', '--background', 4.5, 'a link in running text'],
  ['--success', '--background', 4.5, 'in-stock line'],
  ['--warning', '--background', 4.5, 'low-stock line'],
  ['--ring', '--background', 3.0, 'focus ring against the page (non-text, 3:1)'],
  ['--border', '--background', 1.5, 'a hairline rule; informational, no WCAG floor'],
]
const INFORMATIONAL = new Set(['--border'])

let failed = 0
for (const mode of ['light', 'dark']) {
  const t = theme.modes[mode].tokens
  console.log(`\n${mode.toUpperCase()}  (${Object.keys(t).length} tokens)`)
  console.log('ratio   floor  fg                      bg                      what')
  for (const [fg, bg, floor, what] of PAIRS) {
    const r = ratio(t[fg], t[bg])
    const ok = r >= floor || INFORMATIONAL.has(fg)
    if (!ok) failed++
    console.log(
      `${r.toFixed(2).padStart(5)}  ${floor.toFixed(1).padStart(5)}  ` +
        `${(fg + ' ' + t[fg]).padEnd(23)} ${(bg + ' ' + t[bg]).padEnd(23)} ${what}${ok ? '' : '   <-- UNDER FLOOR'}`,
    )
  }
}
const keysL = Object.keys(theme.modes.light.tokens).sort()
const keysD = Object.keys(theme.modes.dark.tokens).sort()
console.log(
  `\nkey sets identical across modes: ${JSON.stringify(keysL) === JSON.stringify(keysD)} (${keysL.length} keys)`,
)
console.log(`pairs under floor: ${failed}`)
if (process.argv.includes('--check') && failed > 0) process.exit(1)
