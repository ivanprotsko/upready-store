import { describe, expect, it } from "vitest"

import {
  coverSrcSet,
  parseCourseDescription,
  readCourseCover,
  readCoursePage,
  takesCourseLayout,
} from "./course-page"

// Ivan's text for the centre card (t-2026-09-24-n23, 1.2), as the fixture stores it.
const IVAN = `Без лекарств и препаратов. Мягкое и естественное очищение до последнего камня.

ЭТОТ КУРС ДЛЯ ВАС, ЕСЛИ:
- Быстро утомляетесь Мало энергии
- Есть проблемы с печенью или желчным пузырем
- Если у вас есть хоть один из 70 симптомов
- Заботитесь о своем здоровье

«ПЕЧЕНЬ НЕ БОЛИТ, НО ОНА ПОСЫЛАЕТ НАМ СИМПТОМЫ. ЕСЛИ ОНИ ЕСТЬ, ЗНАЧИТ ПРИШЛО ВРЕМЯ О НЕЙ ПОЗАБОТИТЬСЯ» © Оксана Черкашина

Если чувствуешь:
- Боль в спине, шее, под правой лопаткой
- Хрустят суставы
- Головные боли и мигрени
- Кишечные расстройства, тошнота и чувство тяжести
- Хроническая усталость и потеря энергии

Если видишь:
- Избыточный вес, отечность
- Темные круги под глазами
- Желтеет кожа и белки глаз
- Налет на языке (белый или желтый)
- Жировики, папилломы, экземы
- Повышен сахар в крови`

describe("parseCourseDescription", () => {
  it("reads Ivan's text into lead, three headed lists and the signed quote, in order", () => {
    const blocks = parseCourseDescription(IVAN)

    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "list",
      "quote",
      "list",
      "list",
    ])
    expect(blocks[0]).toEqual({
      type: "paragraph",
      text: "Без лекарств и препаратов. Мягкое и естественное очищение до последнего камня.",
    })
    expect(blocks[1]).toEqual({
      type: "list",
      heading: "ЭТОТ КУРС ДЛЯ ВАС, ЕСЛИ:",
      items: [
        "Быстро утомляетесь Мало энергии",
        "Есть проблемы с печенью или желчным пузырем",
        "Если у вас есть хоть один из 70 симптомов",
        "Заботитесь о своем здоровье",
      ],
    })
    expect(blocks[2]).toEqual({
      type: "quote",
      text: "ПЕЧЕНЬ НЕ БОЛИТ, НО ОНА ПОСЫЛАЕТ НАМ СИМПТОМЫ. ЕСЛИ ОНИ ЕСТЬ, ЗНАЧИТ ПРИШЛО ВРЕМЯ О НЕЙ ПОЗАБОТИТЬСЯ",
      author: "Оксана Черкашина",
    })
    expect(blocks[3]).toMatchObject({ heading: "Если чувствуешь:" })
    expect((blocks[3] as { items: string[] }).items).toHaveLength(5)
    expect(blocks[4]).toMatchObject({ heading: "Если видишь:" })
    expect((blocks[4] as { items: string[] }).items).toHaveLength(6)
  })

  it("accepts the bullets Ivan pasted (•, *) and CRLF line ends", () => {
    const blocks = parseCourseDescription(
      "Если чувствуешь:\r\n    •    Боль в спине\r\n* Хрустят суставы"
    )
    expect(blocks).toEqual([
      {
        type: "list",
        heading: "Если чувствуешь:",
        items: ["Боль в спине", "Хрустят суставы"],
      },
    ])
  })

  it("keeps an ordinary description as paragraphs with their line breaks", () => {
    expect(
      parseCourseDescription(
        "Первая строка\nвторая\n\n<b>тег</b> остаётся текстом"
      )
    ).toEqual([
      { type: "paragraph", text: "Первая строка\nвторая" },
      { type: "paragraph", text: "<b>тег</b> остаётся текстом" },
    ])
    expect(parseCourseDescription("")).toEqual([])
  })

  it("reads a list without a heading and a quote without an author as what they are", () => {
    expect(parseCourseDescription("- один\n- два")).toEqual([
      { type: "list", heading: null, items: ["один", "два"] },
    ])
    expect(parseCourseDescription("«Просто цитата»")).toEqual([
      { type: "paragraph", text: "«Просто цитата»" },
    ])
  })
})

describe("readCourseCover", () => {
  const cover = {
    src: "http://localhost:9241/static/c/liver-1440.webp",
    srcset: [
      { w: 1440, url: "http://localhost:9241/static/c/liver-1440.webp" },
      { w: 480, url: "http://localhost:9241/static/c/liver-480.webp" },
      { w: 768, url: "javascript:alert(1)" },
      { w: "wide", url: "http://x/y.webp" },
    ],
    width: 1440,
    height: 804,
    alt: "Печень среди трав",
  }

  it("keeps well-formed variants, narrowest first, and builds srcset", () => {
    const read = readCourseCover({ cover })!
    expect(read.srcset.map((entry) => entry.w)).toEqual([480, 1440])
    expect(coverSrcSet(read)).toBe(
      "http://localhost:9241/static/c/liver-480.webp 480w, http://localhost:9241/static/c/liver-1440.webp 1440w"
    )
    expect([read.width, read.height, read.alt]).toEqual([
      1440,
      804,
      "Печень среди трав",
    ])
  })

  it("answers null for a missing or unsafe cover", () => {
    expect(readCourseCover(null)).toBeNull()
    expect(readCourseCover({ cover: "x" })).toBeNull()
    expect(
      readCourseCover({ cover: { ...cover, src: "data:image/png;base64,AAA" } })
    ).toBeNull()
  })
})

describe("readCoursePage", () => {
  it("filters each list to well-formed entries", () => {
    const page = readCoursePage({
      course_page: {
        about: [
          { heading: "Об авторе", body: "Текст" },
          { heading: "", body: "x" },
        ],
        faq: [
          { q: "А это больно?", a: "Нет." },
          { q: 1, a: "x" },
        ],
        testimonials: [
          { author: "Мария", text: "Спасибо", source: "image" },
          { author: "", text: "Аноним", source: "image" },
          { author: "Наталья", text: "Отзыв", source: "other" },
        ],
      },
    })
    expect(page).toEqual({
      about: [{ heading: "Об авторе", body: "Текст" }],
      faq: [{ q: "А это больно?", a: "Нет." }],
      testimonials: [
        { author: "Мария", text: "Спасибо", source: "image" },
        { author: "Наталья", text: "Отзыв", source: "text" },
      ],
    })
  })

  it("answers null when there is nothing to show", () => {
    expect(readCoursePage({})).toBeNull()
    expect(readCoursePage({ course_page: { about: [], faq: "x" } })).toBeNull()
  })
})

// N10, cherkashino.com/en 2026-10-05: the course landing stayed Russian under an
// English interface. The base lists are the shop's Russian; English sits in `i18n.en`.
describe("readCoursePage in the page's language", () => {
  const russian = {
    about: [{ heading: "Что входит", body: "Программа длится 7 дней." }],
    faq: [{ q: "А это больно?", a: "Нет." }],
    testimonials: [{ author: "Наталья", text: "Спасибо", source: "text" }],
  }
  const english = {
    about: [{ heading: "What's included", body: "The programme lasts 7 days." }],
    faq: [{ q: "Does it hurt?", a: "No." }],
    testimonials: [{ author: "Natalya", text: "Thank you", source: "text" }],
  }
  const metadata = { course_page: { ...russian, i18n: { en: english } } }

  it("reads the English lists on an English page", () => {
    expect(readCoursePage(metadata, "en")).toEqual(english)
    expect(readCoursePage(metadata, "en-GB")).toEqual(english)
  })

  it("keeps the Russian lists on a Russian page, with or without a translation", () => {
    expect(readCoursePage(metadata, "ru")).toEqual(russian)
    expect(readCoursePage({ course_page: russian }, "ru")).toEqual(russian)
    expect(readCoursePage(metadata)).toEqual(russian)
  })

  it("shows the base for a locale with no translation", () => {
    expect(readCoursePage(metadata, "de")).toEqual(russian)
    expect(readCoursePage({ course_page: russian }, "en")).toEqual(russian)
  })

  it("falls back list by list when the translation is partial or malformed", () => {
    const partial = {
      course_page: {
        ...russian,
        i18n: { en: { faq: english.faq, about: [], testimonials: "x" } },
      },
    }
    expect(readCoursePage(partial, "en")).toEqual({
      about: russian.about,
      faq: english.faq,
      testimonials: russian.testimonials,
    })
    expect(
      readCoursePage({ course_page: { ...russian, i18n: { en: "x" } } }, "en")
    ).toEqual(russian)
    expect(
      readCoursePage({ course_page: { ...russian, i18n: [english] } }, "en")
    ).toEqual(russian)
  })

  it("never lets the i18n object itself reach a list", () => {
    const page = readCoursePage(metadata, "en")
    expect(Object.keys(page ?? {})).toEqual(["about", "faq", "testimonials"])
  })
})

// t-2026-10-13-26, Ivan 13.10: «страница с курсом по лимфе не заполнена». The lymph
// set held its landing's sections in `metadata.course_page` and sold no course of
// lessons, so its page drew none of them.
describe("takesCourseLayout", () => {
  const lymph = readCoursePage({
    course_page: {
      about: [{ heading: "Почему очищение лимфы важно?", body: "Текст" }],
      faq: [{ q: "С какого возраста можно?", a: "C 16 лет" }],
      testimonials: [],
    },
  })

  it("lays out a product with a landing's sections and no course as a course", () => {
    expect(lymph).not.toBeNull()
    expect(takesCourseLayout(false, lymph)).toBe(true)
  })

  it("lays out a product that sells a course as a course, sections or not", () => {
    expect(takesCourseLayout(true, null)).toBe(true)
    expect(takesCourseLayout(true, lymph)).toBe(true)
  })

  it("leaves an ordinary product, with neither, on the ordinary layout", () => {
    expect(takesCourseLayout(false, readCoursePage({}))).toBe(false)
    expect(takesCourseLayout(false, readCoursePage(null))).toBe(false)
  })
})
