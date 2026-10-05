import { Fragment, isValidElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))
// A client component as the payload sees it: not rendered here, its children go
// under an element of its own.
vi.mock("@i18n/navigation", () => ({
  Link: Object.assign(() => null, { clientComponent: true }),
}))

import { parseCourseDescription } from "@lib/util/course-page"
import { parseMarkdown } from "@lib/util/markdown"
import HydrationSlot from "@modules/common/components/hydration-slot"
import MarkdownContent, { Inline } from "@modules/content/components/markdown-content"
import CourseBlock from "@modules/products/components/course-block"
import CourseDescription from "@modules/products/components/course-page/description"
import {
  CourseAbout,
  CourseFaq,
  CourseTestimonials,
} from "@modules/products/components/course-page/sections"

/**
 * The long content of a course page and of every markdown body. Flight sends an
 * element as a row of its own once its row has passed 3200 bytes, wherever in
 * the text that happens, so in long content any element may get such a row for
 * a child. With the row straight under it React 19.2 breaks hydration when the
 * row comes late (46df U-06); pass 3b caught it on the live course page, #418
 * on 3 loads of 22. So every element that holds other elements holds them in a
 * slot, and these suites walk what the components return to see that it does.
 */

type Props = { children?: ReactNode; className?: unknown }

/** Children as the parent gets them from Flight: arrays and key-less fragments spread out. */
const spread = (children: ReactNode): unknown[] => {
  if (children === null || children === undefined || typeof children === "boolean") {
    return []
  }
  if (Array.isArray(children)) {
    return children.flatMap(spread)
  }
  if (isValidElement<Props>(children) && children.type === Fragment && children.key === null) {
    return spread(children.props.children)
  }
  return [children]
}

const isSlot = (node: unknown) => isValidElement(node) && node.type === HydrationSlot

const isServerComponent = (type: unknown): type is (props: unknown) => unknown =>
  typeof type === "function" && type !== HydrationSlot && !("clientComponent" in type)

/**
 * What an element gets for children from Flight: a Server Component is replaced by
 * what it returns. An async one is not: it reaches the payload as a lazy row, so it
 * stays an element here and needs a slot around it like any other.
 */
const own = (children: ReactNode): unknown[] =>
  spread(children).flatMap((child) => {
    if (!isValidElement<Props>(child) || !isServerComponent(child.type)) {
      return [child]
    }
    const rendered = child.type(child.props)
    return rendered instanceof Promise ? [child] : own(rendered as ReactNode)
  })

/** Every element under `node` that holds another element with no slot between them. */
const bare = async (node: unknown, where = ""): Promise<string[]> => {
  const found: string[] = []

  for (const child of spread(node as ReactNode)) {
    if (!isValidElement<Props>(child)) {
      continue
    }
    const { type, props } = child

    if (type === HydrationSlot || type === Fragment) {
      found.push(...(await bare(props.children, where)))
      continue
    }
    if (isServerComponent(type)) {
      found.push(...(await bare(await type(props), where)))
      continue
    }

    // An element, or a client component that puts its children under one.
    const tag = typeof type === "string" ? type : "client"
    const firstClass = typeof props.className === "string" ? `.${props.className.split(" ")[0]}` : ""
    const here = `${where} > ${tag}${firstClass}`
    const mine = own(props.children)
    if (mine.some((item) => isValidElement(item)) && !(mine.length === 1 && isSlot(mine[0]))) {
      found.push(here)
    }
    found.push(...(await bare(props.children, here)))
  }

  return found
}

const BODY = [
  "# Заголовок раздела",
  "Абзац с **жирным**, *курсивом*, `кодом`, [ссылкой внутрь](/store) и [наружу](https://example.com).",
  "- первый пункт с **выделением**\n- второй пункт",
  "1. шаг один\n2. шаг два",
  "> Цитата в первой строке\n> и во второй",
  "---",
  "| Что | Сколько |\n| --- | --- |\n| Уроков | **19** |\n| Недель | 3 |",
  "| | |\n| --- | --- |\n| Почта | [написать](mailto:shop@example.com) |",
  "![подпись](/static/tenants/a/picture.webp)",
].join("\n\n")

const DESCRIPTION = [
  "Без лекарств и препаратов.",
  "ЭТОТ КУРС ДЛЯ ВАС, ЕСЛИ:\n- быстро утомляетесь\n- плохо спите",
  "«Печень не болит» © Автор курса",
].join("\n\n")

const lesson = (order: number, locked: boolean) => ({
  id: `lesson_${order}`,
  title: `Урок ${order}`,
  order,
  locked,
})

const course = {
  id: "course_1",
  product_id: "prod_1",
  title: "Курс",
  slug: "kurs",
  description: "О чём курс",
}

describe("the walk itself", () => {
  it("names an element that holds another one straight under it", async () => {
    expect(
      await bare(
        <div className="outer">
          <span>текст</span>
        </div>
      )
    ).toEqual([" > div.outer"])
  })

  it("names a list whose items come from an array", async () => {
    expect(await bare(<ul>{[<li key="a">а</li>, <li key="b">б</li>]}</ul>)).toEqual([" > ul"])
  })

  it("names an element that holds a slot and something beside it", async () => {
    expect(
      await bare(
        <div>
          <HydrationSlot>
            <span>а</span>
          </HydrationSlot>
          <span>б</span>
        </div>
      )
    ).toEqual([" > div"])
  })

  it("sees through a key-less fragment, which Flight drops", async () => {
    expect(
      await bare(
        <div>
          <>
            <span>а</span>
          </>
        </div>
      )
    ).toEqual([" > div"])
  })

  it("looks inside a Server Component and inside a client component's children", async () => {
    const Server = () => (
      <p>
        <b>а</b>
      </p>
    )
    const Client = Object.assign((_props: { children?: ReactNode }) => null, {
      clientComponent: true,
    })

    expect(await bare(<Server />)).toEqual([" > p"])
    expect(
      await bare(
        <Client>
          <b>а</b>
        </Client>
      )
    ).toEqual([" > client"])
  })

  it("takes a Server Component that answers with a slot for the slot, unless it is async", async () => {
    const Slotted = () => (
      <HydrationSlot>
        <b>а</b>
      </HydrationSlot>
    )
    const Late = async () => (
      <HydrationSlot>
        <b>а</b>
      </HydrationSlot>
    )

    expect(
      await bare(
        <p>
          <Slotted />
        </p>
      )
    ).toEqual([])
    expect(
      await bare(
        <p>
          <Late />
        </p>
      )
    ).toEqual([" > p"])
  })

  it("passes an element whose only child is a slot, and one that holds text alone", async () => {
    expect(
      await bare(
        <div>
          <HydrationSlot>
            <p>текст</p>
            <p>
              <HydrationSlot>
                <b>а</b>
              </HydrationSlot>
            </p>
          </HydrationSlot>
        </div>
      )
    ).toEqual([])
  })
})

describe("long content keeps every nested element in a slot", () => {
  it("has a markdown body with every kind of block and inline node", () => {
    const blocks = parseMarkdown(BODY)
    expect(new Set(blocks.map((block) => block.type))).toEqual(
      new Set(["heading", "paragraph", "list", "quote", "rule", "table"])
    )
    const inline = JSON.stringify(blocks)
    for (const type of ["strong", "em", "code", "link", "image"]) {
      expect(inline).toContain(`"type":"${type}"`)
    }
  })

  it("MarkdownContent", async () => {
    expect(await bare(<MarkdownContent source={BODY} />)).toEqual([])
  })

  it("Inline under a page title", async () => {
    expect(
      await bare(
        <h1>
          <Inline nodes={[{ type: "text", value: "Оферта " }, { type: "code", value: "{{ТОКЕН}}" }]} />
        </h1>
      )
    ).toEqual([])
  })

  it("CourseAbout", async () => {
    const sections = [
      { heading: "Первый раздел", body: BODY },
      { heading: "Второй раздел", body: "Один абзац." },
    ]
    expect(await bare(<CourseAbout sections={sections} />)).toEqual([])
  })

  it("CourseFaq", async () => {
    const items = [
      { q: "Первый вопрос?", a: BODY },
      { q: "Второй вопрос?", a: "Короткий ответ." },
    ]
    expect(await bare(<CourseFaq items={items} />)).toEqual([])
  })

  it("CourseTestimonials", async () => {
    const items = [
      { author: "Анна", text: "Первый отзыв", source: "text" as const },
      { author: "Мария", text: "Второй отзыв", source: "image" as const },
    ]
    expect(await bare(<CourseTestimonials items={items} />)).toEqual([])
  })

  it("CourseBlock for a guest: every lesson locked", async () => {
    const data = {
      course,
      lessons: [lesson(1, true), lesson(2, true)],
      has_access: false,
      progress: null,
    }
    expect(await bare(<CourseBlock data={data} />)).toEqual([])
  })

  it("CourseBlock for a buyer: progress, the link to the course, lessons as links", async () => {
    const data = {
      course,
      lessons: [lesson(1, false), lesson(2, false)],
      has_access: true,
      progress: { completed: 1, total: 2, percent: 50 },
    }
    expect(await bare(<CourseBlock data={data} />)).toEqual([])
  })

  it("CourseDescription with a lead line, a headed list and a signed quote", async () => {
    expect(parseCourseDescription(DESCRIPTION).map((block) => block.type)).toEqual([
      "paragraph",
      "list",
      "quote",
    ])
    expect(await bare(<CourseDescription description={DESCRIPTION} />)).toEqual([])
  })
})
