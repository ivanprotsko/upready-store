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
