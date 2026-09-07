// Contrast ratios for the electronics preset, WCAG 2.1 relative luminance.
// Input: the token map below. Output: every named foreground/background pair with its ratio.
import fs from 'node:fs'

const hex2rgb = (h) => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
const lum = (h) =>
  hex2rgb(h)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const theme = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
// pairs: [foreground token, background token, what renders there, minimum required]
const PAIRS = [
  ['--foreground', '--background', 'body copy on the page', 4.5],
  ['--foreground', '--card', 'body copy on a product card', 4.5],
  ['--card-foreground', '--card', 'card title', 4.5],
  ['--popover-foreground', '--popover', 'cart drawer / dropdown option label', 4.5],
  ['--primary-foreground', '--primary', 'label on the primary button', 4.5],
  ['--secondary-foreground', '--secondary', 'label on the secondary button', 4.5],
  ['--accent-foreground', '--accent', 'label on a hovered row', 4.5],
  ['--muted-foreground', '--background', 'subtitle, price note, breadcrumb', 4.5],
  ['--muted-foreground', '--card', 'spec row value on a card', 4.5],
  ['--muted-foreground', '--muted', 'placeholder text in a muted block', 4.5],
  ['--muted-foreground', '--secondary', 'disabled button label', 4.5],
  ['--destructive-foreground', '--destructive', 'label on the destructive button', 4.5],
  ['--destructive', '--background', 'error text on the page', 4.5],
  ['--destructive', '--card', 'error text inside a card', 4.5],
  ['--link', '--background', 'link in body copy', 4.5],
  ['--link', '--card', 'link inside a card', 4.5],
  ['--link', '--popover', 'link inside the drawer', 4.5],
  ['--success', '--background', 'in-stock text', 4.5],
  ['--success', '--card', 'in-stock text on a card', 4.5],
  ['--warning', '--background', 'low-stock text', 4.5],
  ['--warning', '--card', 'low-stock text on a card', 4.5],
  ['--primary', '--background', 'price, active tab, ghost-button label', 4.5],
  ['--primary', '--card', 'price on a product card', 4.5],
  ['--primary', '--popover', 'selected option in the drawer', 4.5],
  ['--foreground', '--secondary', 'text on a secondary surface', 4.5],
  ['--foreground', '--muted', 'text on a muted surface', 4.5],
  ['--foreground', '--accent', 'text on a hover surface', 4.5],
  ['--card-foreground', '--popover', 'text moved between surfaces', 4.5],
  // non-text: 3.0:1 is the WCAG minimum for UI components and graphical objects
  ['--ring', '--background', 'focus ring on the page', 3.0],
  ['--ring', '--card', 'focus ring on a card', 3.0],
  ['--ring', '--secondary', 'focus ring on a secondary surface', 3.0],
  ['--input', '--background', 'input outline at rest (WCAG 1.4.11: a control boundary)', 3.0],
  ['--input', '--card', 'input outline inside a card', 3.0],
  ['--primary', '--secondary', 'primary swatch on a secondary chip', 3.0],
  ['--chart-1', '--card', 'first chart series', 3.0],
  ['--chart-2', '--card', 'second chart series', 3.0],
  ['--chart-3', '--card', 'third chart series', 3.0],
]

let fails = 0
for (const mode of ['dark', 'light']) {
  const t = theme.modes[mode].tokens
  console.log(`\n=== ${mode} ===`)
  console.log('| fg token | bg token | fg hex | bg hex | ratio | min | verdict | renders as |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const [fg, bg, what, min] of PAIRS) {
    const r = ratio(t[fg], t[bg])
    const ok = r >= min
    if (!ok) fails++
    console.log(
      `| \`${fg}\` | \`${bg}\` | ${t[fg]} | ${t[bg]} | **${r.toFixed(2)}:1** | ${min.toFixed(1)} | ${ok ? 'pass' : 'FAIL'} | ${what} |`,
    )
  }
}

// Decorative dividers. WCAG 1.4.11 applies to boundaries that are the ONLY way to
// identify a control; --border draws hairlines beside surfaces that are already
// distinguished by their own background token, so these are reported, not required.
const INFO = [
  ['--border', '--background', 'hairline divider on the page'],
  ['--border', '--card', 'card outline against the page'],
  ['--border', '--secondary', 'divider on a secondary surface'],
]
for (const mode of ['dark', 'light']) {
  const t = theme.modes[mode].tokens
  console.log(`\n=== ${mode}, informational (decorative, no threshold) ===`)
  console.log('| fg token | bg token | fg hex | bg hex | ratio | renders as |')
  console.log('|---|---|---|---|---|---|')
  for (const [fg, bg, what] of INFO)
    console.log(`| \`${fg}\` | \`${bg}\` | ${t[fg]} | ${t[bg]} | ${ratio(t[fg], t[bg]).toFixed(2)}:1 | ${what} |`)
}
console.log(`\nrequired pairs: ${PAIRS.length * 2} (${PAIRS.length} per mode), failing: ${fails}`)
console.log(`informational pairs: ${INFO.length * 2}`)
process.exit(fails ? 1 : 0)
