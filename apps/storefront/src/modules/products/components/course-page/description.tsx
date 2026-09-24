import { parseCourseDescription } from "@lib/util/course-page"
import { stripHtml } from "@lib/util/strip-html"

/**
 * The whole description of a course in its centre card, between the product's
 * summary and the buy box (t-2026-09-24-n23, Ivan's 1.2): the lead line, the
 * headed lists and the signed quote, as `parseCourseDescription` reads them.
 * An ordinary product shows the three-line `DescriptionExcerpt` here instead;
 * a course is sold by this text, so it is never clamped.
 */
const CourseDescription = ({ description }: { description: string | null }) => {
  const blocks = parseCourseDescription(stripHtml(description ?? ""))

  if (blocks.length === 0) {
    return null
  }

  return (
    <div
      className="flex flex-col gap-y-5 border-t border-dashed border-ui-border-base pt-5"
      data-testid="course-description"
    >
      {blocks.map((block, index) => {
        if (block.type === "list") {
          return (
            <div key={index} className="flex flex-col gap-y-2">
              {block.heading && (
                <h2 className="text-base font-semibold text-ui-fg-base">
                  {block.heading}
                </h2>
              )}
              <ul className="flex list-disc flex-col gap-y-1 ps-5 text-base leading-7 text-ui-fg-base marker:text-ui-fg-muted">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </div>
          )
        }

        if (block.type === "quote") {
          return (
            <figure
              key={index}
              className="flex flex-col gap-y-2 rounded-e-rounded border-s-2 border-ui-border-interactive bg-ui-bg-subtle px-4 py-3"
            >
              <blockquote className="text-base font-medium leading-7 text-ui-fg-base">
                «{block.text}»
              </blockquote>
              {block.author && (
                <figcaption className="text-sm text-ui-fg-subtle">
                  © {block.author}
                </figcaption>
              )}
            </figure>
          )
        }

        return (
          <p
            key={index}
            className="whitespace-pre-line text-lg font-medium leading-7 text-ui-fg-base"
          >
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

export default CourseDescription
