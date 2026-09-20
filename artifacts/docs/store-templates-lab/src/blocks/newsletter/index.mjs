import { esc } from "../../lib/html.mjs"
export const meta = { id: "newsletter" }

export function render(b, ctx) {
  return `<section class="band news" data-block="newsletter" data-bleed>
    <div class="container news-in">
      <div class="stack-tight news-copy">
        <h2 data-role="section-title">${esc(b.title)}</h2>
        <p data-role="body">${esc(b.note)}</p>
      </div>
      <form class="news-form" onsubmit="return false">
        <label class="field news-field">
          <span class="sr-only">Электронная почта</span>
          <input class="input" type="email" placeholder="почта@пример.рф" aria-label="Электронная почта" required>
        </label>
        <button class="btn" data-variant="primary" type="submit">${esc(b.cta)}</button>
        <p data-role="meta" class="news-legal">${esc(b.legal)}</p>
      </form>
    </div>
  </section>`
}
