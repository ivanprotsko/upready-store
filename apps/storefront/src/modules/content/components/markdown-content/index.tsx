import type React from "react"

import { Link } from "@i18n/navigation"
import type { MarkdownBlock, MarkdownInline } from "@lib/util/markdown"
import { parseMarkdown } from "@lib/util/markdown"

/**
 * Renders the block list `@lib/util/markdown` produces as React elements. No
 * `dangerouslySetInnerHTML` anywhere: the body is tenant-written text, and every
 * text node here is escaped by React itself, so markup in the source stays
 * literal text rather than becoming HTML.
 *
 * An internal link (`/…`) goes through `@i18n/navigation`'s `Link`, so it keeps
 * the visitor's locale prefix; an external one is a plain anchor with
 * `rel="noreferrer"`, the same pair the footer already uses.
 */

const Inline = ({ nodes }: { nodes: MarkdownInline[] }) => (
  <>
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
  </>
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

const Block = ({ block }: { block: MarkdownBlock }) => {
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
        {block.items.map((item, index) => (
          <li key={index}>
            <Inline nodes={item} />
          </li>
        ))}
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
        {block.content.map((line, index) => (
          <p key={index} className="text-base-regular text-ui-fg-subtle">
            <Inline nodes={line} />
          </p>
        ))}
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
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-base-regular text-ui-fg-base">
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th
                  key={index}
                  className="border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-start font-semibold"
                >
                  <Inline nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-ui-border-base px-3 py-2 align-top">
                    <Inline nodes={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <p className="text-base-regular text-ui-fg-base">
      <Inline nodes={block.content} />
    </p>
  )
}

const MarkdownContent = ({ source }: { source: string }) => {
  const blocks = parseMarkdown(source)

  if (blocks.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-4">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

export default MarkdownContent
