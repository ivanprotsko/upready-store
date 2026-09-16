/**
 * Изображения лаборатории — сгенерированные SVG, а не стоковые фотографии.
 * Причина прямая: судится СТИЛЬ, и чужая фотография либо тащит лицензию, либо
 * подменяет предмет спора (кадр вытянет любую вёрстку). Плюс правило 42c:
 * артефакт не зависит от внешнего источника.
 *
 * Два режима, как велит --media-fit шаблона:
 *   packshot — силуэт предмета с полем, для магазинов упаковки (contain);
 *   scene    — композиция во весь кадр, для лайфстайла (cover).
 *
 * Цвета печатаются ЛИТЕРАЛЬНО из палитры шаблона: это генерация ИЗ токенов,
 * поэтому assets/media/ выведен из-под проверки QR-TOKENS (см. check.mjs).
 * Один и тот же вход даёт один и тот же SVG — сборка идемпотентна.
 */

/** Детерминированный генератор: имя товара → повторяемая последовательность. */
function rng(seed) {
  let h = 2166136261
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000 }
}
const lerp = (a, b, t) => a + (b - a) * t
const n2 = (v) => Math.round(v * 100) / 100

/** Смешение двух hex-цветов — чтобы два одинаковых предмета различались колористикой. */
function mixHex(a, b, t) {
  const h = (x) => [1, 3, 5].map((i) => parseInt(String(x).slice(i, i + 2), 16))
  const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b)
  return "#" + [r1, g1, b1].map((v, i) => Math.round(lerp(v, [r2, g2, b2][i], t)).toString(16).padStart(2, "0")).join("")
}

/**
 * Колористика ЭКЗЕМПЛЯРА: два свитера одного силуэта не должны быть неразличимы.
 * Тон корпуса и акцента сдвигается детерминированно по имени товара.
 */
function shade(tones, seed) {
  const r = rng("тон-" + seed)
  const t1 = lerp(-0.46, 0.44, r())   // разброс широкий: два свитера должны читаться как РАЗНЫЕ товары
  const soft = t1 < 0 ? mixHex(tones.soft, tones.ink, -t1) : mixHex(tones.soft, tones.light, t1)
  const accent = r() > 0.55 ? mixHex(tones.accent, tones.ink, lerp(0.05, 0.3, r())) : tones.accent
  return { ...tones, soft, accent }
}

/** Кадрирование: галерея показывает один предмет РАЗНЫМИ планами, а не пять копий. */
const FRAMES = ["34 96 332 392", "96 150 210 248", "58 236 284 236", "8 70 384 424", "34 96 332 392"]

/**
 * Силуэты. Каждый рисуется в системе 400×500, «стоит» на y=460 и получает
 * поле сверху, поэтому предметы разных видов выглядят одного роста.
 * t = { ink, soft, line, accent, light } — тона из палитры шаблона.
 */
const SHAPES = {
  jar: (t, r) => {
    const w = lerp(150, 195, r()), x = 200 - w / 2, top = lerp(210, 250, r())
    return `
      <rect x="${n2(x - 8)}" y="${n2(top - 34)}" width="${n2(w + 16)}" height="34" rx="8" fill="${t.ink}"/>
      <rect x="${n2(x)}" y="${n2(top)}" width="${n2(w)}" height="${n2(460 - top)}" rx="14" fill="${t.soft}"/>
      <rect x="${n2(x + 14)}" y="${n2(top + 46)}" width="${n2(w - 28)}" height="${n2(400 - top)}" rx="6" fill="${t.light}"/>
      <rect x="${n2(x + 30)}" y="${n2(top + 74)}" width="${n2(w - 60)}" height="10" rx="5" fill="${t.accent}"/>
      <rect x="${n2(x + 30)}" y="${n2(top + 96)}" width="${n2((w - 60) * 0.62)}" height="8" rx="4" fill="${t.line}"/>`
  },
  bottle: (t, r) => {
    const w = lerp(104, 130, r()), x = 200 - w / 2
    const neckW = 38, neckX = 200 - neckW / 2, shoulder = 214, bottom = 458
    return `
      <rect x="${n2(neckX - 4)}" y="112" width="${n2(neckW + 8)}" height="30" rx="7" fill="${t.ink}"/>
      <rect x="${n2(neckX)}" y="138" width="${neckW}" height="${n2(shoulder - 138)}" fill="${t.soft}"/>
      <path d="M${n2(neckX)} ${n2(shoulder - 26)} q0 26 ${n2(-(200 - neckX - w / 2) - 0)} 26 h${n2(w)} q${n2(-(w / 2 - neckW / 2))} 0 ${n2(-(w / 2 - neckW / 2))} -26 z" fill="none"/>
      <path d="M${n2(x)} ${n2(bottom)} v${n2(-(bottom - shoulder - 22))} q0 -30 ${n2(w / 2 - neckW / 2)} -40 h${neckW} q${n2(w / 2 - neckW / 2)} 10 ${n2(w / 2 - neckW / 2)} 40 v${n2(bottom - shoulder - 22)} a10 10 0 0 1 -10 10 h${n2(-w + 20)} a10 10 0 0 1 -10 -10 z" fill="${t.soft}"/>
      <rect x="${n2(x + 10)}" y="${n2(bottom - 150)}" width="${n2(w - 20)}" height="96" rx="5" fill="${t.light}"/>
      <rect x="${n2(x + 26)}" y="${n2(bottom - 122)}" width="${n2(w - 52)}" height="10" rx="5" fill="${t.accent}"/>
      <rect x="${n2(x + 26)}" y="${n2(bottom - 100)}" width="${n2((w - 52) * 0.6)}" height="8" rx="4" fill="${t.line}"/>`
  },
  tube: (t, r) => {
    const w = lerp(88, 112, r()), x = 200 - w / 2
    return `
      <rect x="176" y="108" width="48" height="30" rx="8" fill="${t.ink}"/>
      <path d="M${n2(x)} 176 h${n2(w)} v246 a10 10 0 0 1-10 10 h${n2(-w + 20)} a10 10 0 0 1-10-10 z" fill="${t.soft}"/>
      <path d="M${n2(x)} 176 q${n2(w / 2)} -44 ${n2(w)} 0 z" fill="${t.soft}"/>
      <rect x="${n2(x + 12)}" y="240" width="${n2(w - 24)}" height="8" rx="4" fill="${t.accent}"/>
      <rect x="${n2(x + 12)}" y="262" width="${n2((w - 24) * 0.55)}" height="7" rx="3" fill="${t.line}"/>
      <rect x="${n2(x - 4)}" y="424" width="${n2(w + 8)}" height="16" rx="4" fill="${t.ink}"/>`
  },
  pouch: (t, r) => {
    const w = lerp(180, 214, r()), x = 200 - w / 2, top = lerp(150, 176, r())
    return `
      <path d="M${n2(x)} ${n2(top)} h${n2(w)} v${n2(456 - top)} h${n2(-w)} z" fill="${t.soft}"/>
      <path d="M${n2(x)} ${n2(top)} h${n2(w)} l-14 -26 h${n2(-w + 28)} z" fill="${t.ink}"/>
      <circle cx="200" cy="${n2(top + 92)}" r="44" fill="${t.light}"/>
      <path d="M170 ${n2(top + 100)} q30 -46 60 0" stroke="${t.accent}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="${n2(x + 26)}" y="${n2(top + 168)}" width="${n2(w - 52)}" height="9" rx="4" fill="${t.line}"/>
      <rect x="${n2(x + 26)}" y="${n2(top + 190)}" width="${n2((w - 52) * 0.6)}" height="9" rx="4" fill="${t.line}"/>`
  },
  box: (t, r) => {
    const w = lerp(172, 206, r()), h = lerp(216, 258, r()), x = 200 - w / 2, y = 460 - h
    return `
      <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="6" fill="${t.soft}"/>
      <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w * 0.3)}" height="${n2(h)}" fill="${t.light}"/>
      <rect x="${n2(x + w * 0.42)}" y="${n2(y + 36)}" width="${n2(w * 0.44)}" height="12" rx="6" fill="${t.accent}"/>
      <rect x="${n2(x + w * 0.42)}" y="${n2(y + 62)}" width="${n2(w * 0.3)}" height="9" rx="4" fill="${t.line}"/>
      <rect x="${n2(x + w * 0.42)}" y="${n2(y + h - 56)}" width="${n2(w * 0.36)}" height="9" rx="4" fill="${t.line}"/>`
  },
  blister: (t, r) => {
    const cols = 4, rows = 3, w = 188, h = 246, x = 106, y = 214
    let d = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${t.soft}"/>`
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      d += `<circle cx="${n2(x + 30 + i * 42)}" cy="${n2(y + 44 + j * 64)}" r="${n2(lerp(15, 19, r()))}" fill="${t.light}"/>`
    }
    return d
  },
  appliance: (t, r) => {
    const w = lerp(200, 236, r()), x = 200 - w / 2
    return `
      <rect x="${n2(x - 10)}" y="176" width="${n2(w + 20)}" height="30" rx="12" fill="${t.ink}"/>
      <rect x="${n2(x)}" y="200" width="${n2(w)}" height="238" rx="24" fill="${t.soft}"/>
      <rect x="${n2(x + 26)}" y="268" width="${n2(w - 52)}" height="66" rx="8" fill="${t.ink}"/>
      <rect x="${n2(x + 40)}" y="288" width="${n2(w - 80)}" height="12" rx="4" fill="${t.accent}"/>
      <circle cx="${n2(x + 44)}" cy="384" r="12" fill="${t.line}"/>
      <circle cx="${n2(x + w - 44)}" cy="384" r="12" fill="${t.line}"/>
      <rect x="${n2(x + 76)}" y="374" width="${n2(w - 152)}" height="20" rx="10" fill="${t.light}"/>`
  },
  candle: (t, r) => {
    const w = lerp(76, 96, r()), x = 200 - w / 2, top = lerp(200, 228, r())
    return `
      <path d="M200 ${n2(top - 34)} q16 18 0 30 q-16 -12 0 -30z" fill="${t.accent}"/>
      <rect x="${n2(x)}" y="${n2(top)}" width="${n2(w)}" height="${n2(460 - top)}" rx="10" fill="${t.soft}"/>
      <ellipse cx="200" cy="${n2(top)}" rx="${n2(w / 2)}" ry="9" fill="${t.light}"/>
      <rect x="${n2(x + 10)}" y="${n2(top + 70)}" width="${n2(w - 20)}" height="8" rx="4" fill="${t.line}"/>`
  },
  soap: (t, r) => {
    const w = lerp(196, 224, r()), h = lerp(120, 146, r()), x = 200 - w / 2, y = 460 - h - 34
    return `
      <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="18" fill="${t.soft}"/>
      <rect x="${n2(x + 26)}" y="${n2(y + h - 40)}" width="${n2(w - 52)}" height="64" rx="8" fill="${t.light}"/>
      <rect x="${n2(x + 46)}" y="${n2(y + h - 18)}" width="${n2(w - 92)}" height="9" rx="4" fill="${t.accent}"/>
      <circle cx="200" cy="${n2(y + 52)}" r="26" fill="${t.line}" opacity="0.5"/>`
  },
  chair: (t, r) => {
    const w = lerp(196, 224, r()), x = 200 - w / 2
    const seatY = 316, backTop = lerp(150, 176, r())
    return `
      <rect x="${n2(x + 18)}" y="${n2(backTop)}" width="${n2(w - 36)}" height="${n2(seatY - backTop - 34)}" rx="12" fill="${t.accent}"/>
      <rect x="${n2(x + 18)}" y="${n2(backTop)}" width="12" height="${n2(seatY - backTop)}" rx="5" fill="${t.ink}"/>
      <rect x="${n2(x + w - 30)}" y="${n2(backTop)}" width="12" height="${n2(seatY - backTop)}" rx="5" fill="${t.ink}"/>
      <rect x="${n2(x)}" y="${n2(seatY)}" width="${n2(w)}" height="26" rx="10" fill="${t.soft}"/>
      <rect x="${n2(x + 14)}" y="${n2(seatY + 26)}" width="14" height="118" rx="6" fill="${t.ink}"/>
      <rect x="${n2(x + w - 28)}" y="${n2(seatY + 26)}" width="14" height="118" rx="6" fill="${t.ink}"/>
      <rect x="${n2(x + 14)}" y="${n2(seatY + 86)}" width="${n2(w - 28)}" height="10" rx="5" fill="${t.line}"/>`
  },
  lamp: (t, r) => {
    const w = lerp(150, 182, r())
    return `
      <path d="M${n2(200 - w / 2)} 250 l${n2(w * 0.18)} -96 h${n2(w * 0.64)} l${n2(w * 0.18)} 96 z" fill="${t.soft}"/>
      <rect x="196" y="250" width="8" height="160" fill="${t.ink}"/>
      <ellipse cx="200" cy="420" rx="66" ry="16" fill="${t.ink}"/>
      <ellipse cx="200" cy="250" rx="${n2(w / 2)}" ry="12" fill="${t.accent}"/>`
  },
  sofa: (t, r) => {
    const w = lerp(286, 318, r()), x = 200 - w / 2
    return `
      <rect x="${n2(x)}" y="242" width="${n2(w)}" height="86" rx="18" fill="${t.soft}"/>
      <rect x="${n2(x)}" y="312" width="${n2(w)}" height="76" rx="16" fill="${t.ink}"/>
      <rect x="${n2(x + 14)}" y="264" width="${n2(w / 2 - 22)}" height="56" rx="10" fill="${t.accent}"/>
      <rect x="${n2(x + w / 2 + 8)}" y="264" width="${n2(w / 2 - 22)}" height="56" rx="10" fill="${t.light}"/>
      <rect x="${n2(x + 18)}" y="388" width="18" height="34" rx="6" fill="${t.line}"/>
      <rect x="${n2(x + w - 36)}" y="388" width="18" height="34" rx="6" fill="${t.line}"/>`
  },
  table: (t, r) => {
    const w = lerp(292, 324, r()), x = 200 - w / 2
    return `
      <rect x="${n2(x)}" y="252" width="${n2(w)}" height="26" rx="8" fill="${t.soft}"/>
      <rect x="${n2(x + 24)}" y="278" width="18" height="152" rx="6" fill="${t.ink}"/>
      <rect x="${n2(x + w - 42)}" y="278" width="18" height="152" rx="6" fill="${t.ink}"/>
      <rect x="${n2(x + 24)}" y="352" width="${n2(w - 48)}" height="12" rx="6" fill="${t.line}"/>
      <ellipse cx="200" cy="240" rx="34" ry="12" fill="${t.accent}"/>`
  },
  shirt: (t, r) => {
    const w = lerp(228, 258, r()), x = 200 - w / 2
    return `
      <path d="M${n2(x)} 200 l58-44 h${n2(w - 116)} l58 44 -44 46 -18-14 v218 h${n2(-w + 88)} V232 l-18 14 z" fill="${t.soft}"/>
      <path d="M${n2(200 - 30)} 156 q30 40 60 0" fill="none" stroke="${t.ink}" stroke-width="10"/>
      <rect x="${n2(x + 62)}" y="300" width="${n2(w - 124)}" height="10" rx="5" fill="${t.accent}"/>`
  },
  dress: (t, r) => {
    const hem = lerp(150, 182, r())
    return `
      <path d="M160 160 l40-22 40 22 -18 40 v28 l${n2(hem / 2)} 222 h${n2(-hem - 44)} l${n2(hem / 2)} -222 v-28 z" fill="${t.soft}"/>
      <path d="M170 156 q30 34 60 0" fill="none" stroke="${t.ink}" stroke-width="9"/>
      <path d="M186 268 h28" stroke="${t.accent}" stroke-width="9" stroke-linecap="round"/>`
  },
  shoe: (t, r) => {
    const w = lerp(268, 300, r()), x = 200 - w / 2
    return `
      <path d="M${n2(x)} 396 v-52 q0-30 28-30 h34 l44 36 h${n2(w - 150)} q40 0 40 30 v16 z" fill="${t.soft}"/>
      <rect x="${n2(x)}" y="392" width="${n2(w)}" height="26" rx="10" fill="${t.ink}"/>
      <path d="M${n2(x + 96)} 332 l46 28" stroke="${t.accent}" stroke-width="9" stroke-linecap="round"/>
      <path d="M${n2(x + 122)} 320 l44 28" stroke="${t.accent}" stroke-width="9" stroke-linecap="round"/>`
  },
  bag: (t, r) => {
    const w = lerp(184, 212, r()), x = 200 - w / 2
    return `
      <path d="M${n2(x + 34)} 244 v-34 a${n2(w / 2 - 34)} 46 0 0 1 ${n2(w - 68)} 0 v34" fill="none" stroke="${t.ink}" stroke-width="12"/>
      <rect x="${n2(x)}" y="240" width="${n2(w)}" height="196" rx="14" fill="${t.soft}"/>
      <rect x="${n2(x + 28)}" y="316" width="${n2(w - 56)}" height="12" rx="6" fill="${t.accent}"/>`
  },
  book: (t, r) => {
    const w = lerp(172, 200, r()), h = lerp(238, 268, r()), x = 200 - w / 2, y = 456 - h
    return `
      <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="6" fill="${t.soft}"/>
      <rect x="${n2(x)}" y="${n2(y)}" width="18" height="${n2(h)}" rx="4" fill="${t.ink}"/>
      <rect x="${n2(x + 44)}" y="${n2(y + 52)}" width="${n2(w - 76)}" height="12" rx="6" fill="${t.accent}"/>
      <rect x="${n2(x + 44)}" y="${n2(y + 78)}" width="${n2((w - 76) * 0.6)}" height="10" rx="5" fill="${t.line}"/>
      <rect x="${n2(x + 44)}" y="${n2(y + h - 64)}" width="${n2((w - 76) * 0.42)}" height="10" rx="5" fill="${t.line}"/>`
  },
  device: (t, r) => {
    const w = lerp(196, 222, r()), h = lerp(250, 280, r()), x = 200 - w / 2, y = 450 - h
    return `
      <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="22" fill="${t.ink}"/>
      <rect x="${n2(x + 12)}" y="${n2(y + 14)}" width="${n2(w - 24)}" height="${n2(h - 40)}" rx="14" fill="${t.light}"/>
      <rect x="${n2(x + 34)}" y="${n2(y + 48)}" width="${n2(w - 68)}" height="12" rx="6" fill="${t.accent}"/>
      <rect x="${n2(x + 34)}" y="${n2(y + 74)}" width="${n2((w - 68) * 0.55)}" height="10" rx="5" fill="${t.soft}"/>
      <rect x="${n2(200 - 22)}" y="${n2(y + h - 20)}" width="44" height="6" rx="3" fill="${t.soft}"/>`
  },
  canister: (t, r) => {
    const w = lerp(196, 224, r()), x = 200 - w / 2, top = lerp(196, 218, r())
    return `
      <rect x="${n2(200 - 34)}" y="${n2(top - 30)}" width="68" height="30" rx="8" fill="${t.ink}"/>
      <path d="M${n2(x)} ${n2(top)} h${n2(w)} l-18 236 h${n2(-w + 36)} z" fill="${t.soft}"/>
      <rect x="${n2(x + 22)}" y="${n2(top + 70)}" width="${n2(w - 44)}" height="86" rx="8" fill="${t.light}"/>
      <rect x="${n2(x + 40)}" y="${n2(top + 100)}" width="${n2(w - 80)}" height="11" rx="5" fill="${t.accent}"/>`
  },
}

export const SHAPE_KINDS = Object.keys(SHAPES)

/** Категория товара → силуэт. Неизвестное падает на «box», а не на пустоту. */
export const KIND_BY_CATEGORY = {
  мёд: "jar", масла: "bottle", добавки: "box", стевия: "box", асд: "bottle",
  антисептики: "bottle", стимуляторы: "blister", "фито-свечи": "candle", мультиварки: "appliance",
  чай: "pouch", травы: "pouch", крем: "tube", уход: "tube", маска: "jar", сыворотка: "bottle",
  мыло: "soap", парфюм: "bottle", набор: "box",
  стулья: "chair", светильники: "lamp", диваны: "sofa", столы: "table", хранение: "box",
  футболки: "shirt", платья: "dress", обувь: "shoe", сумки: "bag", аксессуары: "bag",
  книги: "book", техника: "device", электроника: "device",
  кухня: "appliance", инструмент: "box",
  хозтовары: "canister", упаковка: "canister", опт: "canister",
}

/**
 * Категория может назвать НЕСКОЛЬКО предметов: три одинаковых планшета в ряду
 * читаются как ошибка выгрузки. Выбор детерминированный по имени товара.
 */
export function pickKind(category, seed, fallback = "box") {
  const v = KIND_BY_CATEGORY[String(category || "").toLowerCase()] || fallback
  if (!Array.isArray(v)) return v
  return v[Math.floor(rng(seed)() * v.length) % v.length]
}

/** Паккшот: силуэт с полем. 400×500, прозрачный фон — подложку даёт .media. */
export function packshot({ seed, kind, tones, frame = 0 }) {
  const r = rng(seed)
  const draw = SHAPES[kind] || SHAPES.box
  const t = shade(tones, seed)
  // Окно viewBox сужено до зоны, где реально стоят фигуры (y 96…484): иначе предмет
  // занимает половину коробки и выкладка читается как «много воздуха» (замер на ferma).
  const box = FRAMES[frame % FRAMES.length]
  const [, , w, h] = box.split(" ").map(Number)
  const mirror = frame === 4 ? ' transform="scale(-1,1) translate(-400,0)"' : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${w}" height="${h}" role="img">` +
    `<g${mirror}><ellipse cx="200" cy="466" rx="${n2(lerp(120, 150, r()))}" ry="13" fill="${t.line}" opacity="0.35"/>` +
    draw(t, r) + `</g></svg>`
}

/** Сцена: композиция во весь кадр для шаблонов с --media-fit: cover. */
export function scene({ seed, kind, tones, w = 400, h = 500, frame = 0 }) {
  const r = rng(seed)
  const draw = SHAPES[kind] || SHAPES.box
  tones = shade(tones, seed)
  const zoom = [1, 1.28, 1.14, 0.92, 1][frame % 5]
  const horizon = n2(lerp(h * 0.52, h * 0.68, r()))
  const arcR = n2(lerp(Math.min(w, h) * 0.3, Math.min(w, h) * 0.46, r()))
  const cx = n2(lerp(w * 0.34, w * 0.66, r()))
  const scale = (Math.min(w, h) / 500) * lerp(0.82, 0.96, r()) * zoom
  const tx = n2(w / 2 - 200 * scale), ty = n2(horizon - 460 * scale + h * 0.06)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    <rect width="${w}" height="${h}" fill="${tones.bg}"/>
    <rect y="${horizon}" width="${w}" height="${n2(h - horizon)}" fill="${tones.light}"/>
    <circle cx="${cx}" cy="${n2(horizon - arcR * 0.24)}" r="${arcR}" fill="${tones.accent}" opacity="0.22"/>
    <g transform="translate(${tx} ${ty}) scale(${n2(scale)})">${draw(tones, r)}</g>
    <rect y="${n2(horizon - 1)}" width="${w}" height="2" fill="${tones.line}" opacity="0.5"/>
  </svg>`
}

/**
 * Hero-графика: ШЕСТЬ композиций. Одна на все шаблоны читалась как обои, перекрашенные
 * семь раз (поймано глазами на контрольном листе первых экранов) — язык общий,
 * но рисунок у каждого магазина свой. Единственное место, где канон Geist разрешает
 * градиент, — это оно.
 */
const HERO = {
  // круги и волны: мягкий, «продуктовый»
  orbits: (t, r, w, h, id) => {
    const bands = Array.from({ length: 5 }, (_, i) => {
      const y = n2(h * (0.3 + i * 0.12) + lerp(-40, 40, r()))
      const amp = n2(lerp(30, 90, r()))
      return `<path d="M0 ${y} Q ${n2(w * 0.3)} ${n2(y - amp)} ${n2(w * 0.55)} ${y} T ${w} ${n2(y - amp * 0.4)}" fill="none" stroke="${t.line}" stroke-width="${n2(lerp(1.5, 3.5, r()))}" opacity="${n2(lerp(0.25, 0.6, r()))}"/>`
    }).join("")
    return `<circle cx="${n2(w * lerp(0.62, 0.8, r()))}" cy="${n2(h * lerp(0.3, 0.5, r()))}" r="${n2(h * lerp(0.28, 0.4, r()))}" fill="${t.accent}" opacity="0.28"/>
      <circle cx="${n2(w * lerp(0.18, 0.34, r()))}" cy="${n2(h * lerp(0.55, 0.78, r()))}" r="${n2(h * lerp(0.14, 0.24, r()))}" fill="${t.soft}" opacity="0.4"/>${bands}`
  },
  // диагональные полосы: технично, «складской»
  diagonals: (t, r, w, h) => Array.from({ length: 9 }, (_, i) => {
    const x = n2(w * (i / 9) - w * 0.2 + lerp(-20, 20, r()))
    const wd = n2(lerp(w * 0.03, w * 0.09, r()))
    const fill = i % 3 === 0 ? t.accent : i % 3 === 1 ? t.soft : t.line
    return `<path d="M${x} ${h} L${n2(x + h * 0.55)} 0 h${wd} L${n2(x + wd)} ${h} z" fill="${fill}" opacity="${n2(lerp(0.12, 0.34, r()))}"/>`
  }).join(""),
  // сетка дуг: редакционно, «модный»
  arcs: (t, r, w, h) => {
    const cx = n2(w * 0.5), cy = n2(h * 1.02)
    return Array.from({ length: 7 }, (_, i) => {
      const rad = n2(h * (0.22 + i * 0.16))
      return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${i % 2 ? t.accent : t.line}" stroke-width="${n2(lerp(1.2, 3, r()))}" opacity="${n2(lerp(0.2, 0.5, r()))}"/>`
    }).join("") + `<circle cx="${n2(w * 0.74)}" cy="${n2(h * 0.3)}" r="${n2(h * 0.17)}" fill="${t.soft}" opacity="0.32"/>`
  },
  // вертикальные колонны: архитектурно, «мебельный»
  columns: (t, r, w, h) => Array.from({ length: 11 }, (_, i) => {
    const x = n2(w * (i / 11)), wd = n2(w / 11 - 6)
    const top = n2(h * lerp(0.12, 0.6, r()))
    return `<rect x="${x}" y="${top}" width="${wd}" height="${n2(h - top)}" fill="${i % 4 === 0 ? t.accent : t.soft}" opacity="${n2(lerp(0.1, 0.3, r()))}"/>`
  }).join(""),
  // горизонт и солнце: тёплое, «фермерское»
  horizon: (t, r, w, h) => {
    const hz = n2(h * lerp(0.58, 0.68, r()))
    const hills = Array.from({ length: 3 }, (_, i) => {
      const cx = n2(w * lerp(0.12 + i * 0.3, 0.3 + i * 0.3, r()))
      const rad = n2(h * lerp(0.16, 0.3, r()))
      return `<circle cx="${cx}" cy="${hz}" r="${rad}" fill="${i === 1 ? t.soft : t.line}" opacity="${n2(lerp(0.25, 0.45, r()))}"/>`
    }).join("")
    return `<circle cx="${n2(w * 0.72)}" cy="${n2(hz - h * 0.26)}" r="${n2(h * 0.15)}" fill="${t.accent}" opacity="0.5"/>
      ${hills}<rect y="${hz}" width="${w}" height="${n2(h - hz)}" fill="${t.light}" opacity="0.55"/>
      <rect y="${n2(hz - 1)}" width="${w}" height="2" fill="${t.line}" opacity="0.5"/>`
  },
  // сетка карточек: «каталожное», много позиций
  tiles: (t, r, w, h) => {
    const cols = 8, rows = 4
    let d = ""
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      if (r() > 0.72) continue
      const cw = n2(w / cols - 10), ch = n2(h / rows - 10)
      d += `<rect x="${n2(i * (w / cols) + 5)}" y="${n2(j * (h / rows) + 5)}" width="${cw}" height="${ch}" rx="10" fill="${r() > 0.75 ? t.accent : t.soft}" opacity="${n2(lerp(0.1, 0.28, r()))}"/>`
    }
    return d
  },
  // рассыпанная сетка коробов: складское, «оптовое»
  grain: (t, r, w, h) => {
    const cols = 14, rows = 7
    let d = ""
    for (let i = 0; i < cols; i += 1) for (let j = 0; j < rows; j += 1) {
      const sz = n2(lerp(w * 0.012, w * 0.028, r()))
      d += `<rect x="${n2(i * (w / cols) + lerp(4, 18, r()))}" y="${n2(j * (h / rows) + lerp(4, 18, r()))}" width="${sz}" height="${sz}" rx="${n2(sz * 0.22)}" fill="${r() > 0.82 ? t.accent : t.soft}" opacity="${n2(lerp(0.12, 0.4, r()))}"/>`
    }
    return d
  },
}
export const HERO_VARIANTS = Object.keys(HERO)

export function heroArt({ seed, tones, w = 1600, h = 900, variant = "orbits" }) {
  const r = rng(seed)
  const id = `g${Math.floor(r() * 100000)}`
  const draw = HERO[variant] || HERO.orbits
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${tones.bg}"/><stop offset="1" stop-color="${tones.light}"/>
    </linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    ${draw(tones, r, w, h, id)}
  </svg>`
}

/** Плитка категории: крупный силуэт предмета на подложке — знак раздела, а не абстракция. */
export function tileArt({ seed, tones, kind, w = 600, h = 400 }) {
  const r = rng(seed)
  const draw = SHAPES[kind] || SHAPES.box
  const scale = (h / 500) * lerp(0.86, 0.98, r())
  const tx = n2(w / 2 - 200 * scale), ty = n2(h - 470 * scale)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    <rect width="${w}" height="${h}" fill="${tones.bg}"/>
    <circle cx="${n2(w * lerp(0.2, 0.34, r()))}" cy="${n2(h * lerp(0.22, 0.38, r()))}" r="${n2(h * lerp(0.16, 0.26, r()))}" fill="${tones.accent}" opacity="0.2"/>
    <g transform="translate(${tx} ${ty}) scale(${n2(scale)})">${draw(tones, r)}</g>
  </svg>`
}
