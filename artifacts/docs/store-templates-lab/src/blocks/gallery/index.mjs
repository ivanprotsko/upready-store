import { esc, map } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "gallery" }

/* Галерея, а не стопка (диагноз C5): одновременно виден ОДИН кадр, миниатюра
   показывает ТОТ ЖЕ кроп (--aspect-thumb ≡ --aspect-gallery), листание
   стрелками и свайпом, увеличение — в лайтбоксе. */
export function render(b, ctx) {
  const shots = b.shots || []
  return `<div class="gal" data-component="gallery" data-gallery>
    <div class="gal-stage">
      <div class="media gal-main" data-img-role="gallery"${ctx.tpl.media.pad ? " data-media-pad" : ""}>
        ${map(shots, (s, i) => `<img src="${esc(ctx.galleryImg(s, i))}" alt="${esc(s.alt)}"${i ? " hidden" : ""} data-gal-slide="${i}" width="800" height="1000"${i ? ' loading="lazy"' : ""}>`)}
      </div>
      <button class="icon-btn gal-zoom" type="button" data-gal-zoom aria-label="Увеличить фотографию">${icons.expand}</button>
      <button class="icon-btn gal-nav gal-prev" type="button" data-gal-prev aria-label="Предыдущая фотография">${icons.chevronLeft}</button>
      <button class="icon-btn gal-nav gal-next" type="button" data-gal-next aria-label="Следующая фотография">${icons.chevronRight}</button>
    </div>
    <div class="gal-thumbs" role="tablist" aria-label="Фотографии товара">
      ${map(shots, (s, i) => `<button class="gal-thumb" type="button" role="tab" data-gal-thumb="${i}" aria-selected="${i === 0}" aria-label="Фотография ${i + 1}">
        <span class="media" data-img-role="thumb"${ctx.tpl.media.pad ? " data-media-pad" : ""}><img src="${esc(ctx.galleryImg(s, i))}" alt="" data-decorative loading="lazy" width="800" height="1000"></span>
      </button>`)}
    </div>
    <dialog class="gal-lightbox" data-gal-lightbox aria-label="Фотография во весь экран">
      <button class="icon-btn gal-close" type="button" data-gal-close aria-label="Закрыть">${icons.close}</button>
      <img alt="" data-decorative data-gal-big>
    </dialog>
  </div>`
}
