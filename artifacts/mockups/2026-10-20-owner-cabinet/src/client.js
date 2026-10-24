// t-2026-10-20-23 v4: the prototype's behaviour Ivan asked to see, nothing of the screen's data lives here.
// - the top bar slides away on a scroll down and comes back on any scroll up (mark 27, lesson ic-topbar-hides-on-scroll);
// - a chart's bar shows its bucket, total and each source's value on hover, a click pins it (mark 24);
// - a donut's segment or legend row shows its units and rubles in the middle on a click (mark 28);
// - a pick in a list (period, source of the top) closes the list.
;(() => {
  const ready = (fn) => (document.readyState === "loading" ? addEventListener("DOMContentLoaded", fn) : fn())

  ready(() => {
    // ---- the top bar
    const head = document.querySelector("[data-hide-on-scroll]")
    if (head) {
      let last = scrollY
      addEventListener(
        "scroll",
        () => {
          const y = scrollY
          if (y <= 8) head.classList.remove("is-hidden")
          else if (y > last + 2) head.classList.add("is-hidden")
          else if (y < last - 2) head.classList.remove("is-hidden")
          head.classList.toggle("is-under", y > 8)
          last = y
        },
        { passive: true },
      )
    }

    // ---- chart tooltips
    let pinned = null
    const tipOf = (plot) => {
      let tip = plot.querySelector(".chart-tip")
      if (!tip) {
        tip = document.createElement("div")
        tip.className = "chart-tip"
        tip.setAttribute("role", "tooltip")
        plot.append(tip)
      }
      return tip
    }
    const text = (tag, cls, value) => {
      const el = document.createElement(tag)
      if (cls) el.className = cls
      el.textContent = value
      return el
    }
    const show = (col, color) => {
      const plot = col.closest("[data-chart]")
      const tip = tipOf(plot)
      tip.replaceChildren()
      const head = text("div", "chart-tip-head", "")
      head.append(text("span", "txt-plus", col.dataset.tip))
      if (col.classList.contains("is-future")) head.append(text("span", "txt-subtle", "Час ещё не наступил"))
      else head.append(text("span", "txt-subtle", `Всего: ${col.dataset.total}`))
      tip.append(head)
      for (const row of (col.dataset.rows || "").split(";").filter(Boolean)) {
        const [c, label, value] = row.split("|")
        const line = text("div", `chart-tip-row${c === color ? " is-hot" : ""}`, "")
        const name = text("span", "chart-tip-name", "")
        name.append(text("span", `dot shop-${c}`, ""), text("span", "truncate", label))
        line.append(name, text("span", "chart-tip-value", value))
        tip.append(line)
      }
      for (const other of plot.querySelectorAll(".col.is-hot")) other.classList.remove("is-hot")
      col.classList.add("is-hot")
      plot.classList.add("has-hot")
      tip.classList.add("is-on")
      const box = plot.getBoundingClientRect()
      const at = col.getBoundingClientRect()
      const width = tip.offsetWidth
      const left = Math.min(Math.max(at.left - box.left + at.width / 2 - width / 2, 0), box.width - width)
      tip.style.left = `${left}px`
    }
    const hide = (plot) => {
      plot.classList.remove("has-hot")
      for (const col of plot.querySelectorAll(".col.is-hot, .col.is-pinned")) col.classList.remove("is-hot", "is-pinned")
      plot.querySelector(".chart-tip")?.classList.remove("is-on")
    }
    const unpin = () => {
      if (!pinned) return
      const plot = pinned.closest("[data-chart]")
      pinned = null
      hide(plot)
    }
    for (const plot of document.querySelectorAll("[data-chart]")) {
      plot.addEventListener("pointermove", (event) => {
        if (pinned) return
        const col = event.target.closest(".col")
        if (!col) return
        show(col, event.target.closest(".bar-part")?.dataset.color)
      })
      plot.addEventListener("pointerleave", () => {
        if (!pinned) hide(plot)
      })
      plot.addEventListener("click", (event) => {
        const col = event.target.closest(".col")
        if (!col) return
        event.stopPropagation()
        if (pinned === col) return unpin()
        unpin()
        show(col, event.target.closest(".bar-part")?.dataset.color)
        pinned = col
        col.classList.add("is-pinned")
      })
    }

    // ---- donuts
    const pick = (pie, index) => {
      const same = pie.dataset.picked === index
      pie.dataset.picked = same ? "" : index
      pie.classList.toggle("has-pick", !same)
      for (const el of pie.querySelectorAll("[data-i]")) el.classList.toggle("is-pick", !same && el.dataset.i === index)
      const value = pie.querySelector(".pie-center-value")
      const caption = pie.querySelector(".pie-center-caption")
      const el = pie.querySelector(`path[data-i="${index}"]`)
      if (same || !el) {
        value.textContent = value.dataset.default
        caption.textContent = caption.dataset.default
        return
      }
      value.textContent = el.dataset.sum
      caption.textContent = [el.dataset.qty, el.dataset.share].filter(Boolean).join(" · ")
    }
    for (const pie of document.querySelectorAll("[data-pie]")) {
      pie.addEventListener("click", (event) => {
        const item = event.target.closest("[data-i]")
        if (!item) return
        event.stopPropagation()
        pick(pie, item.dataset.i)
      })
      pie.addEventListener("keydown", (event) => {
        const item = event.target.closest("[data-i]")
        if (item && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          pick(pie, item.dataset.i)
        }
      })
    }
    document.addEventListener("click", () => {
      unpin()
      for (const pie of document.querySelectorAll("[data-pie].has-pick")) pick(pie, pie.dataset.picked)
    })

    // ---- a pick in a list closes it
    for (const input of document.querySelectorAll('input[name="period"], input[name="top-src"]')) {
      input.addEventListener("change", () => {
        for (const pop of document.querySelectorAll("[popover]")) if (pop.matches(":popover-open")) pop.hidePopover()
      })
    }
  })
})()
