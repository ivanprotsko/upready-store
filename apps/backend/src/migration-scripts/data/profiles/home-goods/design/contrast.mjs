// WCAG 2.1 relative-luminance contrast for the Long Morning palette (home-goods, W1).
// Every ratio printed in style-board.md section 3.2 comes out of this file; a ratio
// nobody computed is not a ratio.
const hex = (h) => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

const PAIRS = JSON.parse(process.argv[2])
let worst = Infinity
for (const [name, fg, bg, floor] of PAIRS) {
  const r = ratio(fg, bg)
  const need = floor ?? 4.5
  const ok = r >= need ? 'PASS' : 'FAIL'
  if (r < worst) worst = r
  console.log(`${ok}  ${r.toFixed(2)}:1  (needs ${need})  ${name}  fg ${fg} on bg ${bg}`)
}
console.log(`worst pair: ${worst.toFixed(2)}:1`)
