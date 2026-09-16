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
