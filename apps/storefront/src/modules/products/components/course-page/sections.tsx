import type React from "react"
import { getTranslations } from "next-intl/server"

import type {
  CourseAboutSection,
  CourseFaqItem,
  CourseTestimonial,
} from "@lib/util/course-page"
import HydrationSlot from "@modules/common/components/hydration-slot"
import MarkdownContent from "@modules/content/components/markdown-content"

/**
 * The sections under a course's centre card (t-2026-09-24-n23, Ivan's order):
 * «О программе», then the lesson list (`CourseBlock`, placed by the template),
 * «Вопросы и ответы», and the participants' testimonials at the very end. All
 * of them live in the content column, beside the sticky buy box, and read
 * `metadata.course_page` (`readCoursePage`). A section with no entries renders
 * nothing.
 *
 * Every element here that holds other elements holds them in a `HydrationSlot`.
 * These sections are long, so Flight sends most of their elements as rows of
 * their own, and an element with such a row straight under it breaks hydration
 * when the row comes late (46df U-06). Measured on the live course page in pass
 * 3b: 49 such elements, #418 and the whole page drawn again on 3 loads of 22.
 */

/** The card every section of the course page sits in, the same card the page's others use. */
export const CourseSection = ({
  id,
  title,
  children,
  "data-testid": testId,
}: {
  id: string
  title: string
  children: React.ReactNode
  "data-testid"?: string
}) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className="flex scroll-mt-24 flex-col gap-y-5 rounded-large border border-ui-border-base bg-ui-bg-base p-4 small:p-6"
    data-testid={testId}
  >
    <HydrationSlot>
      <h2 id={`${id}-title`} className="text-xl font-semibold text-ui-fg-base">
        {title}
      </h2>
      {children}
    </HydrationSlot>
  </section>
)

/** «О программе»: the landing's own sections, each a heading and a markdown body. */
export async function CourseAbout({
  sections,
}: {
  sections: CourseAboutSection[]
}) {
  if (sections.length === 0) {
    return null
  }
  const t = await getTranslations("CoursePage")

  return (
    <CourseSection
      id="course-about"
      title={t("about")}
      data-testid="course-about"
    >
      <div className="flex flex-col gap-y-8">
        <HydrationSlot>
          {sections.map((section, index) => (
            <div key={index} className="flex flex-col gap-y-3">
              <HydrationSlot>
                <h3 className="text-large-semi text-ui-fg-base">
                  {section.heading}
                </h3>
                <MarkdownContent source={section.body} />
              </HydrationSlot>
            </div>
          ))}
        </HydrationSlot>
      </div>
    </CourseSection>
  )
}

/**
 * «Вопросы и ответы» as native `<details>` rows: no script to hydrate, the
 * browser's own keyboard and screen-reader behaviour, and the answer's text is
 * in the page for search engines even while folded. The first one stands open.
 */
export async function CourseFaq({ items }: { items: CourseFaqItem[] }) {
  if (items.length === 0) {
    return null
  }
  const t = await getTranslations("CoursePage")

  return (
    <CourseSection id="course-faq" title={t("faq")} data-testid="course-faq">
      <div className="flex flex-col divide-y divide-ui-border-base border-y border-ui-border-base">
        <HydrationSlot>
          {items.map((item, index) => (
            <details
              key={index}
              open={index === 0}
              className="group py-1"
              data-testid="course-faq-item"
            >
              <HydrationSlot>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-x-4 rounded-rounded py-3 text-base font-medium text-ui-fg-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-fg-interactive [&::-webkit-details-marker]:hidden">
                  <HydrationSlot>
                    <span>{item.q}</span>
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-circle bg-ui-bg-subtle text-ui-fg-subtle transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </HydrationSlot>
                </summary>
                <div className="pb-4 pe-11">
                  <HydrationSlot>
                    <MarkdownContent source={item.a} />
                  </HydrationSlot>
                </div>
              </HydrationSlot>
            </details>
          ))}
        </HydrationSlot>
      </div>
    </CourseSection>
  )
}

/**
 * The participants' testimonials, as text: each one only with its author's name
 * (the landing's screenshots without a visible author are left out, the audit is
 * in the task's evidence report). Two columns from 1024, a card each, never split
 * across the columns.
 */
export async function CourseTestimonials({
  items,
}: {
  items: CourseTestimonial[]
}) {
  if (items.length === 0) {
    return null
  }
  const t = await getTranslations("CoursePage")

  return (
    <CourseSection
      id="course-testimonials"
      title={t("testimonials")}
      data-testid="course-testimonials"
    >
      <div className="gap-4 small:columns-2">
        <HydrationSlot>
          {items.map((item, index) => (
            <figure
              key={index}
              className="mb-4 flex break-inside-avoid flex-col gap-y-3 rounded-large bg-ui-bg-subtle p-4"
              data-testid="course-testimonial"
            >
              <HydrationSlot>
                <blockquote className="whitespace-pre-line text-sm leading-6 text-ui-fg-base">
                  {item.text}
                </blockquote>
                <figcaption className="text-sm font-semibold text-ui-fg-base">
                  {item.author}
                </figcaption>
              </HydrationSlot>
            </figure>
          ))}
        </HydrationSlot>
      </div>
    </CourseSection>
  )
}
