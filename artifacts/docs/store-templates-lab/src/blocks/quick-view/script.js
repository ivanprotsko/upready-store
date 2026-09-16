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
