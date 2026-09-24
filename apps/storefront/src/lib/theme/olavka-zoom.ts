/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15), Ivan's remark 1 (2026-09-25):
 * «на десктопе ширина контента тянулась до 1440, а потом масштабировалась
 * пропорционально до 1920px, затем все центрировалось».
 *
 * Up to 1440px the page is fluid (the 1440 `content-container`). From 1440 to 1920 the
 * whole page is the 1440 layout scaled by `innerWidth / 1440` — CSS `zoom` on the root,
 * so type, gaps, radii and pictures grow together; above 1920 the scale stays at 1.333
 * and the 1440 container centres. Media queries still see the real viewport.
 *
 * `zoom` also scales viewport units (`100vh` under zoom 1.333 paints 133% high), so the
 * factor is published as `--page-zoom` for the few desktop rules that size by the
 * viewport (`calc(90dvh / var(--page-zoom, 1))`), and `sizes` of pictures sized in px
 * say so in `vw` above 1440.
 *
 * Applied before the first paint by an inline script that writes ONE `<style>` into
 * `<head>` (not the `<html>` style attribute, which React owns for the brand tokens),
 * and again on resize.
 */
export const OLAVKA_ZOOM_MIN = 1440
export const OLAVKA_ZOOM_MAX = 1920

export function olavkaZoomScript(): string {
  return `(function(){try{var s=document.createElement("style");s.id="olavka-zoom";document.head.appendChild(s);var f=function(){var w=window.innerWidth,k=w>${OLAVKA_ZOOM_MIN}?Math.min(w,${OLAVKA_ZOOM_MAX})/${OLAVKA_ZOOM_MIN}:1;s.textContent=k>1?"html{zoom:"+k+";--page-zoom:"+k+"}":"";};f();window.addEventListener("resize",f);}catch(e){}})();`
}
