/**
 * ОДИН измеритель страницы — и для диагностики живого магазина (design/measure-live.mjs),
 * и для проверки сгенерированных шаблонов (check.mjs). Правило 19b: процесс не дублируется.
 *
 * Возвращает ФАКТЫ, а не вердикты. Пороги живут в design/quality-rules.md и в check.mjs,
 * потому что вердикт зависит от того, что меряем: у живого магазина он диагноз, у шаблона — гейт.
 *
 * Всё считается ВНУТРИ страницы и агрегируется там же (правило 25b: тонкий результат,
 * а не дамп каждого элемента): наружу уходят гистограммы и списки нарушителей, не весь DOM.
 */

/** Путь к playwright в главном чекауте: свой node_modules в worktree не установлен. */
export const PLAYWRIGHT =
  "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
export const AXE_CORE =
  "/Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/axe-core@4.11.0/node_modules/axe-core/axe.min.js"

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

/** Открывает chromium; падает громко, если namespace без chromium (правило 19f). */
export async function launch() {
  const { chromium } = await import(PLAYWRIGHT)
  if (!chromium) throw new Error("playwright: chromium отсутствует в namespace — проверь путь PLAYWRIGHT")
  return chromium.launch()
}

/**
 * Снимает со страницы все измеримые факты. Страница должна быть уже загружена.
 * @returns {Promise<object>} факты одной страницы в одном вьюпорте
 */
export async function auditPage(page) {
  return page.evaluate(() => {
    const out = {}
    const all = [...document.querySelectorAll("*")].filter((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"
    })

    const bump = (map, key, sample) => {
      const cur = map.get(key) || { count: 0, samples: [] }
      cur.count += 1
      if (sample && cur.samples.length < 3) cur.samples.push(sample)
      map.set(key, cur)
    }
    const dump = (map, keyName) =>
      [...map.entries()]
        .map(([k, v]) => ({ [keyName]: k, count: v.count, samples: v.samples }))
        .sort((a, b) => b.count - a.count)

    const label = (el) => {
      const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48)
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""}${t ? ` «${t}»` : ""}`
    }

    // --- типографика: только элементы с СОБСТВЕННЫМ текстом ---
    const hasOwnText = (el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
    const typeMap = new Map()
    const familyMap = new Map()
    const weightMap = new Map()
    const lhPairs = []
    for (const el of all) {
      if (!hasOwnText(el)) continue
      const cs = getComputedStyle(el)
      const size = Math.round(parseFloat(cs.fontSize) * 100) / 100
      const lh = cs.lineHeight === "normal" ? "normal" : Math.round(parseFloat(cs.lineHeight) * 100) / 100
      bump(typeMap, String(size), label(el))
      bump(familyMap, cs.fontFamily.split(",")[0].replace(/["']/g, ""), null)
      bump(weightMap, cs.fontWeight, null)
      lhPairs.push({ size, lh })
    }
    out.type = { sizes: dump(typeMap, "px"), families: dump(familyMap, "family"), weights: dump(weightMap, "weight") }
    out.lineHeights = [
      ...lhPairs
        .reduce((m, p) => {
          const k = `${p.size}/${p.lh}`
          m.set(k, (m.get(k) || 0) + 1)
          return m
        }, new Map())
        .entries(),
    ]
      .map(([k, count]) => ({ pair: k, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)

    // --- отступы: ненулевые padding/margin/gap ---
    const spaceMap = new Map()
    // margin-left/right исключены намеренно: `margin-inline: auto` возвращается из
  // getComputedStyle УЖЕ вычисленным числом (190px и т.п.) и это центрирование, не ритм.
  const PROPS = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"]
    for (const el of all) {
      const cs = getComputedStyle(el)
      for (const p of PROPS) {
        const raw = cs[p]
        if (!raw || raw === "normal" || raw === "auto") continue
        const v = Math.round(parseFloat(raw) * 100) / 100
        if (!v || Number.isNaN(v)) continue
        bump(spaceMap, String(v), null)
      }
    }
    out.spacing = dump(spaceMap, "px")

    // --- радиусы, границы, тени ---
    const radiusMap = new Map(), borderMap = new Map(), shadowMap = new Map()
    for (const el of all) {
      const cs = getComputedStyle(el)
      const r = parseFloat(cs.borderTopLeftRadius)
      if (r) bump(radiusMap, String(Math.round(r * 100) / 100), null)
      const bw = parseFloat(cs.borderTopWidth)
      if (bw) bump(borderMap, `${Math.round(bw * 100) / 100}px ${cs.borderTopColor}`, null)
      if (cs.boxShadow && cs.boxShadow !== "none") bump(shadowMap, cs.boxShadow.slice(0, 90), null)
    }
    out.radii = dump(radiusMap, "px")
    out.borders = dump(borderMap, "border")
    out.shadows = dump(shadowMap, "shadow")

    // --- цвета ---
    const colorMap = new Map(), bgMap = new Map()
    for (const el of all) {
      const cs = getComputedStyle(el)
      if (hasOwnText(el)) bump(colorMap, cs.color, null)
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") bump(bgMap, cs.backgroundColor, null)
    }
    out.colors = { text: dump(colorMap, "color"), background: dump(bgMap, "color") }

    // --- горизонтальное переполнение ---
    const de = document.documentElement
    const vw = de.clientWidth
    const offenders = []
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) })
      }
    }
    out.overflowX = {
      scrollWidth: de.scrollWidth,
      clientWidth: vw,
      overflow: de.scrollWidth - vw,
      offenders: offenders.slice(0, 12),
      offenderCount: offenders.length,
    }

    // --- картинки: жёсткая коробка соотношения? ---
    out.images = [...document.querySelectorAll("img")].map((img) => {
      const r = img.getBoundingClientRect()
      const cs = getComputedStyle(img)
      const parent = img.parentElement
      const pcs = parent ? getComputedStyle(parent) : null
      const fixedOnSelf = cs.aspectRatio !== "auto" || (cs.height !== "auto" && !cs.height.includes("%"))
      const fixedOnParent = !!pcs && (pcs.aspectRatio !== "auto" || parseFloat(pcs.paddingTop) > 0 && pcs.position === "relative")
      return {
        src: (img.currentSrc || img.src || "").split("/").pop().slice(0, 60),
        natural: img.naturalWidth && img.naturalHeight ? `${img.naturalWidth}x${img.naturalHeight}` : "n/a",
        rendered: `${Math.round(r.width)}x${Math.round(r.height)}`,
        ratio: r.height ? Math.round((r.width / r.height) * 1000) / 1000 : null,
        objectFit: cs.objectFit,
        aspectBox: fixedOnSelf || fixedOnParent,
        alt: img.getAttribute("alt") === null ? null : img.getAttribute("alt").slice(0, 40),
      }
    })

    // --- длина строки в знаках (canvas-мерка ширины символа) ---
    const cvs = document.createElement("canvas")
    const ctx = cvs.getContext("2d")
    const SAMPLE = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя оеаинтсрвл"
    out.lineLength = []
    for (const el of all) {
      if (!hasOwnText(el)) continue
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()
      if (text.length < 80) continue
      const cs = getComputedStyle(el)
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const avg = ctx.measureText(SAMPLE).width / SAMPLE.length
      const r = el.getBoundingClientRect()
      const inner = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      // prose: нижний порог длины строки относится к ДЛИННОМУ тексту в прозаическом
      // блоке, а не к лиду в узкой колонке героя
      const prose = !!el.closest('[data-role="prose"]') || el.getAttribute("data-role") === "body"
      out.lineLength.push({ el: label(el), cpl: Math.round(inner / avg), width: Math.round(inner), fontSize: cs.fontSize, prose })
    }
    out.lineLength.sort((a, b) => b.cpl - a.cpl)
    out.lineLength = out.lineLength.slice(0, 20)

    // --- иерархия заголовков ---
    out.headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => ({
      level: Number(h.tagName[1]),
      size: getComputedStyle(h).fontSize,
      text: (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
    }))

    // --- зона нажатия ---
    const INTERACTIVE = "a,button,[role=button],input:not([type=hidden]),select,textarea,summary"
    out.hitAreas = []
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      // WCAG 2.5.8: ссылка ВНУТРИ абзаца — исключение «inline», меряется отдельно
      const p = el.parentElement
      const inline = el.tagName === "A" && p && getComputedStyle(el).display === "inline" &&
        (p.textContent || "").trim().length > (el.textContent || "").trim().length + 10
      // iconOnly: цель без собственной подписи — только у неё ширина обязана держать 44px
      const txt = (el.textContent || "").trim()
      out.hitAreas.push({
        el: label(el), w: Math.round(r.width), h: Math.round(r.height), inline,
        iconOnly: !txt && !!el.querySelector("svg"),
        // флажок/радио внутри <label>: нажимают ПОДПИСЬ, её размер и есть цель
        wrappedInLabel: /^(checkbox|radio)$/.test(el.getAttribute("type") || "") &&
          !!el.closest("label") && el.closest("label").getBoundingClientRect().height >= 44,
      })
    }
    out.hitAreasSmall = out.hitAreas.filter((a) => !a.inline && (a.w < 44 || a.h < 44))
    delete out.hitAreas

    // --- плотность: сколько «вещей» на первый экран ---
    const vh = window.innerHeight
    out.density = {
      viewportHeight: vh,
      pageHeight: de.scrollHeight,
      aboveFold: all.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.top < vh && r.bottom > 0
      }).length,
      textAboveFold: all.filter((el) => {
        const r = el.getBoundingClientRect()
        return r.top < vh && r.bottom > 0 && hasOwnText(el)
      }).length,
    }

    // --- вертикали сетки: левые края крупных блоков ---
    const edges = new Map()
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.width < 120 || r.height < 40) continue
      bump(edges, String(Math.round(r.left)), null)
    }
    out.leftEdges = dump(edges, "x").slice(0, 16)

    return out
  })
}

/** Контраст текста — axe-core, только правило color-contrast. */
export async function auditContrast(page, axeSource) {
  await page.evaluate(axeSource)
  return page.evaluate(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: "rule", values: ["color-contrast"] },
      resultTypes: ["violations"],
    })
    return (res.violations || []).flatMap((v) =>
      v.nodes.map((n) => ({
        rule: v.id,
        impact: n.impact,
        target: String(n.target[0]).slice(0, 90),
        message: (n.any?.[0]?.message || "").slice(0, 160),
        data: n.any?.[0]?.data ? {
          fg: n.any[0].data.fgColor, bg: n.any[0].data.bgColor,
          ratio: n.any[0].data.contrastRatio, expected: n.any[0].data.expectedContrastRatio,
          fontSize: n.any[0].data.fontSize, fontWeight: n.any[0].data.fontWeight,
        } : null,
      }))
    )
  })
}

/** Ряд чисел → отношения соседей: видна ли шкала. */
export function ratios(values) {
  const s = [...new Set(values)].sort((a, b) => a - b)
  return s.slice(1).map((v, i) => ({ from: s[i], to: v, ratio: Math.round((v / s[i]) * 1000) / 1000 }))
}
