import type React from "react"

import { Link } from "@i18n/navigation"
import type { MarkdownBlock, MarkdownInline } from "@lib/util/markdown"
import { parseMarkdown } from "@lib/util/markdown"
import { articleHeadingLevel, headingAnchors } from "@lib/util/markdown-toc"
import { DISPLAY_2, DISPLAY_3, EYEBROW } from "@modules/journal/typography"
import HydrationSlot from "@modules/common/components/hydration-slot"

/**
 * Renders the block list `@lib/util/markdown` produces as React elements. No
 * `dangerouslySetInnerHTML` anywhere: the body is tenant-written text, and every
 * text node here is escaped by React itself, so markup in the source stays
 * literal text rather than becoming HTML.
 *
 * An internal link (`/…`) goes through `@i18n/navigation`'s `Link`, so it keeps
 * the visitor's locale prefix; an external one is a plain anchor with
 * `rel="noreferrer"`, the same pair the footer already uses.
 *
 * Every element that holds other elements holds them in a `HydrationSlot`. A
 * body is long text, so Flight sends most of its elements as rows of their own,
 * and an element with such a row straight under it breaks hydration when the
 * row comes late (46df U-06; pass 3b: #418 on the course page, whose «О
 * программе» and answers are rendered here).
 */

/**
 * Exported so a page title can render the same code-span styling a `{{ТОКЕН}}`
 * left unfilled gets in the body (b09-storefront-render): the resolver wraps
 * it in backticks either way, and a bare `<h1>{title}</h1>` showed those
 * backticks as literal characters instead of a styled span.
 */
export const Inline = ({ nodes }: { nodes: MarkdownInline[] }) => (
  // A slot and not a bare fragment: Flight drops a key-less one, and these nodes
  // would sit straight under the <p>, <li> or heading that renders them.
  <HydrationSlot>
    {nodes.map((node, index) => {
      switch (node.type) {
        case "strong":
          return <strong key={index}>{node.value}</strong>
        case "em":
          return <em key={index}>{node.value}</em>
        case "code":
          return (
            <code
              key={index}
              className="rounded bg-ui-bg-subtle px-1 py-0.5 text-ui-fg-base"
            >
              {node.value}
            </code>
          )
        case "image":
          // b18-blog-full: a picture the owner uploaded into the text. Plain
          // `<img>` rather than `next/image` on purpose — the source is a
          // tenant upload whose host is not in `next.config.js`'s allowlist,
          // and the optimiser answers 400 for a host it does not know.
          // `loading="lazy"` because these sit far below the fold.
          return (
            <img
              key={index}
              src={node.src}
              alt={node.value}
              loading="lazy"
              className="rounded-rounded my-4 h-auto w-full"
              data-testid="markdown-image"
            />
          )
        case "link":
          return node.href.startsWith("/") ? (
            <Link
              key={index}
              href={node.href}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
            >
              {node.value}
            </Link>
          ) : (
            <a
              key={index}
              href={node.href}
              // `mailto:`/`tel:` hand off to another app, so only a web address
              // opens in a new tab.
              target={/^https?:/i.test(node.href) ? "_blank" : undefined}
              rel="noreferrer"
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
            >
              {node.value}
            </a>
          )
        default:
          return <span key={index}>{node.value}</span>
      }
    })}
  </HydrationSlot>
)

/**
 * One step below the page's own `h1`, which carries the tenant's title in
 * `text-2xl-semi`: a `#` inside the body is a section of that page, not a rival
 * to its title. Measured on the live page 2026-09-11 — at `text-2xl-semi` the
 * first `#` read as a second page title.
 */
const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-xl-semi text-ui-fg-base mt-6 first:mt-0",
  2: "text-large-semi text-ui-fg-base mt-6 first:mt-0",
  3: "text-base-semi text-ui-fg-base mt-4 first:mt-0",
}

/**
 * How a body is set. `default` is a content page's: one step of type below the page title.
 * `article` is a journal article's (t-2026-10-05-03), after the chrxnasdmds journal: large
 * section headings with anchors for the table of contents, body text a size up in the
 * theme's secondary ink, the opening quote as a «Кратко» callout.
 */
export type MarkdownVariant = "default" | "article"

const Block = ({
  block,
  variant = "default",
  anchor = null,
}: {
  block: MarkdownBlock
  variant?: MarkdownVariant
  /** The heading's id, from `headingAnchors`, in the `article` variant. */
  anchor?: string | null
}) => {
  if (variant === "article") {
    return <ArticleBlock block={block} anchor={anchor} />
  }

  if (block.type === "heading") {
    const Tag = (`h${block.level + 1}` as unknown) as React.ElementType

    return (
      <Tag className={HEADING_CLASS[block.level]}>
        <Inline nodes={block.content} />
      </Tag>
    )
  }

  if (block.type === "list") {
    const Tag = (block.ordered ? "ol" : "ul") as React.ElementType

    return (
      <Tag
        className={
          block.ordered
            ? "list-decimal pl-5 text-base-regular text-ui-fg-base flex flex-col gap-y-1"
            : "list-disc pl-5 text-base-regular text-ui-fg-base flex flex-col gap-y-1"
        }
      >
        <HydrationSlot>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </HydrationSlot>
      </Tag>
    )
  }

  // t10-blog: the two block types the journal's articles need. A quote is the
  // summary box every article of this shop opens with, so it is a real card
  // (border + subtle ground) rather than an italic indent; a rule separates
  // the sections of a long read.
  if (block.type === "quote") {
    return (
      <blockquote className="border-s-2 border-ui-border-interactive bg-ui-bg-subtle rounded-e-rounded ps-4 pe-4 py-3 flex flex-col gap-y-2">
        <HydrationSlot>
          {block.content.map((line, index) => (
            <p key={index} className="text-base-regular text-ui-fg-subtle">
              <Inline nodes={line} />
            </p>
          ))}
        </HydrationSlot>
      </blockquote>
    )
  }

  if (block.type === "rule") {
    return <hr className="border-t border-ui-border-base my-2" />
  }

  // f07-page-markdown-tables: the legal pages of a tenant (contacts, offer,
  // privacy) hold their seller details as GFM tables. A real `<table>` here,
  // not a styled `<div>` grid, so a screen reader still announces row/column
  // structure the way it does for the rest of the markdown block types.
  if (block.type === "table") {
    // `contact.ru.md`'s first table opens with a blank header row (`| | |`),
    // written that way because the two real columns are a label and a value
    // with no heading either needs. Every cell empty means there is nothing
    // for a `<thead>` to announce, so it is dropped rather than rendered as a
    // bare grey bar (b09-storefront-render, accept-f07-page-markdown-tables-1
    // nit 2).
    const hasHeader = block.header.some((cell) => cell.length > 0)

    return (
      <div className="overflow-x-auto">
        <HydrationSlot>
          <table className="w-full border-collapse text-base-regular text-ui-fg-base">
            <HydrationSlot>
              {hasHeader ? (
                <thead>
                  <HydrationSlot>
                    <tr>
                      <HydrationSlot>
                        {block.header.map((cell, index) => (
                          <th
                            key={index}
                            className="border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-start font-semibold"
                          >
                            <Inline nodes={cell} />
                          </th>
                        ))}
                      </HydrationSlot>
                    </tr>
                  </HydrationSlot>
                </thead>
              ) : null}
              <tbody>
                <HydrationSlot>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <HydrationSlot>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="border border-ui-border-base px-3 py-2 align-top">
                            <Inline nodes={cell} />
                          </td>
                        ))}
                      </HydrationSlot>
                    </tr>
                  ))}
                </HydrationSlot>
              </tbody>
            </HydrationSlot>
          </table>
        </HydrationSlot>
      </div>
    )
  }

  return (
    <p className="text-base-regular text-ui-fg-base">
      <Inline nodes={block.content} />
    </p>
  )
}

const ARTICLE_TEXT = "text-base leading-relaxed text-ui-fg-subtle small:text-lg"

/**
 * The quote every article of the journal opens with, as the chrxnasdmds «Кратко» callout.
 * A first line that is bold alone becomes the callout's small-caps title, and the lines
 * under it its numbered points: the parser has already dropped their `- ` markers, keeping
 * each quoted line apart (`parseMarkdown`), so a titled quote's lines are its points. A
 * quote without such a title stays a callout of paragraphs.
 */
const ArticleCallout = ({ lines }: { lines: MarkdownInline[][] }) => {
  const [first, ...others] = lines
  const titled = first?.length === 1 && first[0].type === "strong"
  const items = titled ? others : []
  const paragraphs = titled ? [] : lines

  return (
    <aside
      className="flex flex-col gap-5 rounded-rounded border border-ui-border-base bg-ui-bg-subtle px-5 py-5 small:px-7 small:py-7"
      data-testid="article-callout"
    >
      <HydrationSlot>
        {titled ? (
          <p className={`${EYEBROW} text-ui-fg-interactive`}>{first[0].value}</p>
        ) : null}
        {paragraphs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <HydrationSlot>
              {paragraphs.map((line, index) => (
                <p key={index} className={ARTICLE_TEXT}>
                  <Inline nodes={line} />
                </p>
              ))}
            </HydrationSlot>
          </div>
        ) : null}
        {items.length > 0 ? (
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            <HydrationSlot>
              {items.map((item, index) => (
                <li key={index} className="flex items-start gap-4">
                  <span className="w-6 flex-none pt-0.5 text-end text-xl leading-none tabular-nums text-ui-fg-interactive">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-base leading-relaxed text-ui-fg-base small:text-lg">
                    <Inline nodes={item} />
                  </span>
                </li>
              ))}
            </HydrationSlot>
          </ol>
        ) : null}
      </HydrationSlot>
    </aside>
  )
}

const ArticleBlock = ({ block, anchor }: { block: MarkdownBlock; anchor: string | null }) => {
  if (block.type === "heading") {
    const level = articleHeadingLevel(block.level)
    const Tag = (`h${level}` as unknown) as React.ElementType

    return (
      <Tag
        id={anchor ?? undefined}
        className={
          level === 2
            ? `${DISPLAY_2} scroll-mt-24 text-ui-fg-base mt-6 first:mt-0 small:mt-8`
            : `${DISPLAY_3} scroll-mt-24 text-ui-fg-base pt-2`
        }
      >
        <Inline nodes={block.content} />
      </Tag>
    )
  }

  if (block.type === "list") {
    const Tag = (block.ordered ? "ol" : "ul") as React.ElementType

    return (
      <Tag
        className={`${ARTICLE_TEXT} flex flex-col gap-2 ps-5 marker:text-ui-fg-muted ${
          block.ordered ? "list-decimal" : "list-disc"
        }`}
      >
        <HydrationSlot>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </HydrationSlot>
      </Tag>
    )
  }

  if (block.type === "quote") {
    return <ArticleCallout lines={block.content} />
  }

  if (block.type === "rule") {
    return <hr className="my-2 border-t border-ui-border-base small:my-4" />
  }

  if (block.type === "paragraph") {
    return (
      <p className={ARTICLE_TEXT}>
        <Inline nodes={block.content} />
      </p>
    )
  }

  // A table reads the same in an article as on a content page.
  return <Block block={block} />
}

const MarkdownContent = ({
  source,
  variant = "default",
}: {
  source: string
  variant?: MarkdownVariant
}) => {
  const blocks = parseMarkdown(source)

  if (blocks.length === 0) {
    return null
  }

  const anchors = variant === "article" ? headingAnchors(blocks) : []

  return (
    <div className={variant === "article" ? "flex flex-col gap-5 small:gap-6" : "flex flex-col gap-y-4"}>
      <HydrationSlot>
        {blocks.map((block, index) => (
          <Block key={index} block={block} variant={variant} anchor={anchors[index] ?? null} />
        ))}
      </HydrationSlot>
    </div>
  )
}

export default MarkdownContent
