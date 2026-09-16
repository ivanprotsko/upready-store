/* СГЕНЕРИРОВАНО node build.mjs */
/* --- блок: announcement --- */
/* Смена строки раз в 6 с; при prefers-reduced-motion стоит первая и не меняется. */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  document.querySelectorAll("[data-rotating]").forEach(function (bar) {
    var items = bar.querySelectorAll(".announce-item")
    if (items.length < 2 || reduce) return
    var i = 0
    setInterval(function () {
      items[i].hidden = true
      i = (i + 1) % items.length
      items[i].hidden = false
    }, 6000)
  })
})()

;
/* --- блок: cart-drawer --- */
(function () {
  var cart = document.querySelector("[data-cart]")
  if (!cart) return
  function open(v) { cart.hidden = !v; document.body.style.overflow = v ? "hidden" : "" }
  document.querySelectorAll("[data-cart-open]").forEach(function (b) { b.addEventListener("click", function () { open(true) }) })
  cart.querySelectorAll("[data-cart-close]").forEach(function (b) { b.addEventListener("click", function () { open(false) }) })
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false) })
})()

;
/* --- блок: gallery --- */
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

;
/* --- блок: quick-view --- */
(function () {
  var qv = document.querySelector("[data-qv]")
  if (!qv) return
  function open(v) { qv.hidden = !v; document.body.style.overflow = v ? "hidden" : "" }
  document.querySelectorAll("[data-qv-open]").forEach(function (b) {
    b.addEventListener("click", function (e) { e.preventDefault(); open(true) })
  })
  qv.querySelectorAll("[data-qv-close]").forEach(function (b) { b.addEventListener("click", function () { open(false) }) })
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false) })
})()

;
/* --- блок: tabs --- */
/* Десктоп — вкладки, мобиль — аккордеон с ОДНОЙ открытой секцией (спека §8).
   Состояние пересобирается при смене вьюпорта, иначе после поворота экрана
   остаётся раскладка другого режима. */
(function () {
  var mq = window.matchMedia("(max-width: 639px)")
  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'))
    var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'))
    var accs = [].slice.call(root.querySelectorAll("[data-acc]"))
    var bodies = accs.map(function (a) { return root.querySelector("#" + a.getAttribute("aria-controls")) })
    var open = 0

    function sync() {
      if (mq.matches) {
        panels.forEach(function (p) { p.hidden = false })
        bodies.forEach(function (b, k) { if (b) b.hidden = k !== open })
        accs.forEach(function (a, k) { a.setAttribute("aria-expanded", String(k === open)) })
      } else {
        bodies.forEach(function (b) { if (b) b.hidden = false })
        panels.forEach(function (p, k) { p.hidden = k !== open })
        tabs.forEach(function (t, k) { t.setAttribute("aria-selected", String(k === open)) })
      }
    }
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { open = k; sync() })
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
        open = (k + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
        tabs[open].focus(); sync(); e.preventDefault()
      })
    })
    accs.forEach(function (a, k) {
      a.addEventListener("click", function () { open = (open === k && mq.matches) ? -1 : k; sync() })
    })
    mq.addEventListener ? mq.addEventListener("change", sync) : mq.addListener(sync)
    sync()
  })
})()
