// The pure half of `pnpm template:sbs` (t-2026-10-12-33): which pairs a template's sheet holds, their file names,
// labels and column widths, the page one pair is composed on, the sheet itself and the size check. No browser
// here, so `plan.test.mjs` runs it on plain values.

/** The three pages of a template, as the storefront names them and as the 16.09 lab named its shots. */
export const PAGES = Object.freeze([
  { page: "home", lab: "index" },
  { page: "category", lab: "catalog" },
  { page: "product", lab: "product" },
])

export const WIDTHS = Object.freeze([1280, 768, 360])

/** One column's width on a pair, px: half a desktop page, two thirds of a tablet, a phone as it is. */
export const COLUMN = Object.freeze({ 1280: 640, 768: 512, 360: 360 })

/** The gap between the two columns and the padding around a pair, px. */
export const GAP = 8
export const PAD = 16

/** The most one pair's JPEG may weigh. */
export const MAX_BYTES = 400 * 1000

export const LAB_DIR = "artifacts/docs/store-templates-lab/shots"
export const LAB_LABEL = "lab 16.09"

/** The lab drew a desktop and a mobile shot of each page: desktop stands beside 1280 and 768, mobile beside 360. */
export function labShot(id, lab, width) {
  return `${id}-${lab}-${width >= 768 ? "desktop" : "mobile"}.webp`
}

export function storefrontLabel(id) {
  return `storefront ?template=${id}`
}

/**
 * Every pair of a template's sheet, page by page, widest first. `labFiles` lists the names in `LAB_DIR`. A pair whose
 * lab shot is missing keeps the storefront alone; a template with no lab shot at all gets one notice instead of nine.
 */
export function planPairs(id, labFiles) {
  const have = new Set(labFiles)
  const any = PAGES.some(({ lab }) => WIDTHS.some((width) => have.has(labShot(id, lab, width))))
  const pairs = PAGES.flatMap(({ page, lab }) =>
    WIDTHS.map((width) => {
      const name = labShot(id, lab, width)
      const found = have.has(name)
      const note = !any ? null : !found ? `no lab shot ${name}` : width === 768 ? "the lab has no 768 shot: its desktop shot beside it" : null
      return {
        page,
        width,
        file: `sbs-${page}-${width}.jpg`,
        title: `${page}, ${width} px`,
        note,
        lab: found ? name : null,
        column: COLUMN[width],
        labels: { lab: LAB_LABEL, storefront: storefrontLabel(id) },
      }
    })
  )
  const notices = any ? [] : [`${id} has no lab shots in ${LAB_DIR}: the storefront alone, home, category and product.`]
  return { pairs, notices }
}

/** The width of the page one pair is composed on: both columns, or the storefront's alone. */
export function composeWidth(pair) {
  return PAD * 2 + pair.column + (pair.lab ? GAP + pair.column : 0)
}

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

/** The page one pair is screenshotted from: the pair's title, then each column under its label. */
export function composeHtml(pair, { lab, storefront }) {
  const column = (label, src) =>
    `<figure><figcaption>${esc(label)}</figcaption><img src="${esc(src)}" alt="${esc(label)}"></figure>`
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #fff; }
  #pair { display: inline-block; padding: ${PAD}px; font: 18px/1.3 system-ui, sans-serif; color: #222; }
  h1 { margin: 0 0 4px; font-size: 22px; font-weight: 600; }
  p { margin: 0 0 8px; font-size: 16px; color: #555; }
  .cols { display: flex; align-items: flex-start; gap: ${GAP}px; background: #ddd; }
  figure { margin: 0; width: ${pair.column}px; background: #fff; }
  figcaption { padding: 6px 0 8px; }
  img { display: block; width: ${pair.column}px; height: auto; }
</style>
<div id="pair">
<h1>${esc(pair.title)}</h1>
${pair.note ? `<p>${esc(pair.note)}</p>` : ""}
<div class="cols">${pair.lab ? column(pair.labels.lab, lab) : ""}${column(pair.labels.storefront, storefront)}</div>
</div>
`
}

/** `side-by-side.html`: every pair under its title, each picture by its name in the same folder. */
export function sheetHtml({ id, title, date, commit, base, host, locale, paths, pairs, notices = [], problems = [] }) {
  const sections = pairs
    .map((pair) => {
      const alt = pair.lab ? `${pair.title}: ${pair.labels.lab} beside ${pair.labels.storefront}` : `${pair.title}: ${pair.labels.storefront}`
      return `<h2>${esc(pair.title)}</h2>${pair.note ? `<p class="note">${esc(pair.note)}</p>` : ""}<img src="${esc(pair.file)}" alt="${esc(alt)}">`
    })
    .join("\n")
  const list = (items) => (items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "")
  return `<!doctype html>
<meta charset="utf-8">
<title>${esc(id)}: the 16.09 lab beside the storefront</title>
<style>body{font:15px/1.4 system-ui;margin:24px;color:#222}h2{margin:32px 0 8px}.note{color:#555;margin:0 0 8px}img{max-width:100%;border:1px solid #ddd}</style>
<h1>${esc(id)}${title && title !== id ? `, «${esc(title)}»` : ""}: the 16.09 lab beside the storefront</h1>
<p>Left: the lab's shot (<code>${esc(LAB_DIR)}/${esc(id)}-*.webp</code>). Right: the storefront with
<code>?template=${esc(id)}</code>, ${esc(base)}${host ? ` as <code>${esc(host)}</code>` : ""}, locale ${esc(locale)}. The lab drew a
desktop and a mobile shot of each page and no 768.</p>
<p>${esc(date)} · commit ${esc(commit)} · home <code>${esc(paths.home)}</code> · category <code>${esc(paths.category ?? "none")}</code> ·
product <code>${esc(paths.product ?? "none")}</code></p>
${list([...notices, ...problems])}
${sections}
`
}

/** One line for each pair over `MAX_BYTES`. */
export function oversize(files, limit = MAX_BYTES) {
  return files
    .filter(({ bytes }) => bytes > limit)
    .map(({ file, bytes }) => `${file} is ${Math.ceil(bytes / 1000)} KB, over ${limit / 1000} KB`)
}

const unique = (items) => [...new Set(items)]

/** The category pages among `paths` (pathnames), first seen first. */
export function categoryPaths(paths) {
  return unique(paths.filter((p) => /\/categories\/[^/?#]+/.test(p)))
}

/** The product pages among `paths` (pathnames), first seen first. */
export function productPaths(paths) {
  return unique(paths.filter((p) => /\/products\/[^/?#]+\/?$/.test(p)))
}
