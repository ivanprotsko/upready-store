import { Fragment } from "react"
import type React from "react"
import { ArrowDownTray } from "@medusajs/icons"
import { getLocale, getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"
import { getFileSize, isApiFileUrl } from "@lib/data/file-size"
import {
  formatFileSize,
  lessonFileHrefs,
  parseLessonBody,
  type LessonBlock,
  type LessonFileNode,
  type LessonInline,
} from "@lib/util/lesson-body"
import { Inline as ContentInline } from "@modules/content/components/markdown-content"

const LINK_CLASS =
  "text-ui-fg-interactive underline hover:text-ui-fg-interactive-hover"

const HEADING: Record<2 | 3 | 4, { tag: React.ElementType; className: string }> = {
  2: { tag: "h2", className: "text-large-semi text-ui-fg-base mt-2 first:mt-0" },
  3: { tag: "h3", className: "text-base-semi text-ui-fg-base mt-2 first:mt-0" },
  4: { tag: "h4", className: "text-base-semi text-ui-fg-base" },
}

/**
 * A lesson's text, typeset (ask-20261005-054319-4ad4, rule 27i): the blocks
 * `parseLessonBody` reads out of what the owner typed, as paragraphs, real
 * lists, headings and notes, spaced by the styles rather than by blank lines,
 * at a reading measure of about 70 characters. No address is ever shown: a
 * file reads «Скачать «Рецепты» — PDF, 1,2 МБ» with its size when the shop's
 * API answers one, a page reads as the words that introduced it or «Открыть
 * cherkashino.ru». Every text node is escaped by React; no HTML is built.
 */
export default async function LessonBody({ source }: { source: string }) {
  const blocks = parseLessonBody(source, {
    apiOrigin: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? null,
  })

  if (blocks.length === 0) {
    return null
  }

  const hrefs = lessonFileHrefs(blocks)
  const [t, locale, sizes] = await Promise.all([
    getTranslations("CourseBlock"),
    getLocale(),
    Promise.all(hrefs.map((href) => getFileSize(href))),
  ])
  const sizeByHref = new Map(
    hrefs.map((href, index) => [href, formatFileSize(sizes[index], locale)])
  )

  const fileText = (node: LessonFileNode) => {
    const label =
      node.label ??
      (node.name ? t("downloadNamed", { name: node.name }) : t("downloadFile"))
    const size = sizeByHref.get(node.href)

    return size
      ? t("fileWithSize", { label, type: node.ext, size })
      : t("fileWithType", { label, type: node.ext })
  }

  const inline = (nodes: LessonInline[]) =>
    nodes.map((node, index) => {
      switch (node.type) {
        case "text":
          return <Fragment key={index}>{node.value}</Fragment>
        case "break":
          return <br key={index} />
        case "strong":
          return (
            <strong key={index} className="font-semibold">
              {node.value}
            </strong>
          )
        case "file":
          return (
            <a
              key={index}
              href={node.href}
              download={isApiFileUrl(node.href) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-start gap-x-1.5 ${LINK_CLASS}`}
              data-testid="lesson-file-link"
            >
              <ArrowDownTray className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{fileText(node)}</span>
            </a>
          )
        case "page":
          return (
            <a
              key={index}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
              data-testid="lesson-page-link"
            >
              {node.label ?? t("openSite", { host: node.host })}
            </a>
          )
        case "link":
          if (node.href.startsWith("/")) {
            return (
              <Link key={index} href={node.href} className={LINK_CLASS}>
                {node.value}
              </Link>
            )
          }
          return (
            <a
              key={index}
              href={node.href}
              // `mailto:`/`tel:` hand off to another app; only a web address opens a tab.
              target={/^https?:/i.test(node.href) ? "_blank" : undefined}
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {node.value}
            </a>
          )
        default:
          // `em`, `code` and `image` look the same as on the shop's content pages.
          return <ContentInline key={index} nodes={[node]} />
      }
    })

  const block = (item: LessonBlock, index: number) => {
    switch (item.type) {
      case "heading": {
        const { tag: Tag, className } = HEADING[item.level]
        return (
          <Tag key={index} className={className}>
            {inline(item.content)}
          </Tag>
        )
      }
      case "list": {
        const Tag = (item.ordered ? "ol" : "ul") as React.ElementType
        return (
          <Tag
            key={index}
            start={item.ordered && item.start !== 1 ? item.start : undefined}
            className={`${
              item.ordered ? "list-decimal" : "list-disc"
            } flex flex-col gap-y-2 ps-6 text-base-regular text-ui-fg-base marker:text-ui-fg-muted`}
          >
            {item.items.map((nodes, itemIndex) => (
              <li key={itemIndex} className="ps-1">
                {inline(nodes)}
              </li>
            ))}
          </Tag>
        )
      }
      case "quote":
        return (
          <blockquote
            key={index}
            className="flex flex-col gap-y-2 rounded-e-rounded border-s-2 border-ui-border-interactive bg-ui-bg-subtle px-4 py-3"
          >
            {item.lines.map((nodes, lineIndex) => (
              <p key={lineIndex} className="text-base-regular text-ui-fg-subtle">
                {inline(nodes)}
              </p>
            ))}
          </blockquote>
        )
      default:
        return (
          <p key={index} className="text-base-regular text-ui-fg-base">
            {inline(item.content)}
          </p>
        )
    }
  }

  return (
    <div className="flex max-w-[70ch] flex-col gap-y-4" data-testid="lesson-body">
      {blocks.map(block)}
    </div>
  )
}
