/* Вкладки на десктопе; на мобиле CSS раскрывает все панели — скрипт не мешает. */
(function () {
  var mobile = window.matchMedia("(max-width: 639px)")
  document.querySelectorAll("[data-tabs]").forEach(function (root) {
    var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'))
    var panels = [].slice.call(root.querySelectorAll('[role="tabpanel"]'))
    function select(n) {
      if (mobile.matches) return
      tabs.forEach(function (t, k) { t.setAttribute("aria-selected", String(k === n)) })
      panels.forEach(function (p, k) { p.hidden = k !== n })
    }
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { select(k) })
      t.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
        var n = (k + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
        tabs[n].focus(); select(n); e.preventDefault()
      })
    })
  })
})()
