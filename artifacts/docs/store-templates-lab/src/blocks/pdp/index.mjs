import { render as renderGallery } from "../gallery/index.mjs"
import { render as renderSummary } from "../summary/index.mjs"
export const meta = { id: "pdp" }

/* Первый экран товара: галерея и сводка рядом. Пропорция 7:5 — кадру больше,
   но сводка НЕ сжимается до узкой полоски, как в живом магазине (360 px против
   767 px, диагноз A5). Длинный текст живёт ниже, во вкладках, во всю ширину
   контейнера (QR-COLUMN-RANK). */
export function render(b, ctx) {
  return `<section class="band pdp" data-block="pdp" data-tight>
    <div class="container pdp-in">
      <div class="pdp-media">${renderGallery(b.gallery, ctx)}</div>
      <div class="pdp-side">${renderSummary(b.summary, ctx)}</div>
    </div>
  </section>`
}
