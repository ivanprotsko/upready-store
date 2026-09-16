import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "footer", variants: ["columns", "wordmark"] }

const columns = (ctx, cols) => map(cols, (c) => `<div class="ft-col">
  <h3 class="ft-head" data-role="meta">${esc(c.title)}</h3>
  <ul class="ft-list">${map(c.links, (l) => `<li><a class="ft-link" data-role="body" href="${esc(ctx.url(l.page || "index"))}">${esc(l.label)}</a></li>`)}</ul>
</div>`)

export function render(b, ctx) {
  const brand = ctx.tpl.brand
  const cols = b.columns || []
  const contacts = `<div class="ft-col ft-contacts">
    <h3 class="ft-head" data-role="meta">Связь</h3>
    <a class="ft-link row" data-role="body" href="tel:${esc(brand.phone.replace(/[^+\d]/g, ""))}">${icons.phone}${esc(brand.phone)}</a>
    <a class="ft-link row" data-role="body" href="mailto:${esc(brand.email)}">${icons.mail}${esc(brand.email)}</a>
    <span class="ft-link row" data-role="body">${icons.pin}${esc(brand.address)}</span>
  </div>`

  if (b.variant === "wordmark") {
    return `<footer class="ft ft-inverse" data-block="footer" data-bleed>
      <div class="container">
        <div class="ft-grid">${columns(ctx, cols)}${contacts}</div>
        <div class="ft-mark" aria-hidden="true" data-type-exempt="декоративная типографическая масса, кегль задан вьюпортом">${esc(brand.name)}</div>
        <div class="ft-bottom">
          <span data-role="meta">© 2026 ${esc(brand.legal)}</span>
          <span data-role="meta">${esc(brand.inn)}</span>
        </div>
      </div>
    </footer>`
  }

  return `<footer class="ft ft-soft" data-block="footer" data-bleed>
    <div class="container">
      <div class="ft-grid">
        <div class="ft-col ft-brand">
          <span class="wordmark">${esc(brand.name)}</span>
          <p data-role="meta">${esc(brand.tagline)}</p>
        </div>
        ${columns(ctx, cols)}${contacts}
      </div>
      <div class="ft-mark" aria-hidden="true" data-type-exempt="декоративная типографическая масса, кегль задан вьюпортом">${esc(brand.name)}</div>
      <hr class="hr ft-hr">
      <div class="ft-bottom">
        <span data-role="meta">© 2026 ${esc(brand.legal)}</span>
        <span data-role="meta">${esc(brand.inn)}</span>
      </div>
    </div>
  </footer>`
}
