(function () {
  var cart = document.querySelector("[data-cart]")
  if (!cart) return
  function open(v) { cart.hidden = !v; document.body.style.overflow = v ? "hidden" : "" }
  document.querySelectorAll("[data-cart-open]").forEach(function (b) { b.addEventListener("click", function () { open(true) }) })
  cart.querySelectorAll("[data-cart-close]").forEach(function (b) { b.addEventListener("click", function () { open(false) }) })
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false) })
})()
