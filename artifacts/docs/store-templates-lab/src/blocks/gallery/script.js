/* Клавиатура (стрелки), свайп, лайтбокс. Одновременно виден один кадр. */
(function () {
  document.querySelectorAll("[data-gallery]").forEach(function (gal) {
    var slides = gal.querySelectorAll("[data-gal-slide]")
    var thumbs = gal.querySelectorAll("[data-gal-thumb]")
    var box = gal.querySelector("[data-gal-lightbox]")
    var big = gal.querySelector("[data-gal-big]")
    var i = 0
    if (!slides.length) return

    function show(n) {
      i = (n + slides.length) % slides.length
      slides.forEach(function (s, k) { s.hidden = k !== i })
      thumbs.forEach(function (t, k) { t.setAttribute("aria-selected", String(k === i)) })
    }
    thumbs.forEach(function (t, k) { t.addEventListener("click", function () { show(k) }) })
    var prev = gal.querySelector("[data-gal-prev]"), next = gal.querySelector("[data-gal-next]")
    if (prev) prev.addEventListener("click", function () { show(i - 1) })
    if (next) next.addEventListener("click", function () { show(i + 1) })

    gal.setAttribute("tabindex", "0")
    gal.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { show(i - 1); e.preventDefault() }
      if (e.key === "ArrowRight") { show(i + 1); e.preventDefault() }
      if (e.key === "Escape" && box && box.open) box.close()
    })

    var x0 = null
    var stage = gal.querySelector(".gal-stage")
    stage.addEventListener("touchstart", function (e) { x0 = e.changedTouches[0].clientX }, { passive: true })
    stage.addEventListener("touchend", function (e) {
      if (x0 === null) return
      var dx = e.changedTouches[0].clientX - x0
      if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1)
      x0 = null
    }, { passive: true })

    var zoom = gal.querySelector("[data-gal-zoom]"), close = gal.querySelector("[data-gal-close]")
    if (zoom && box && big) {
      zoom.addEventListener("click", function () {
        big.src = slides[i].src
        big.alt = slides[i].alt
        if (typeof box.showModal === "function") box.showModal()
      })
    }
    if (close && box) close.addEventListener("click", function () { box.close() })
  })
})()
