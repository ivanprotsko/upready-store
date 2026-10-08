import { Fragment, type ElementType } from "react"
import { parseLessonBody, type LessonBlock, type LessonFileNode, type LessonInline } from "~/lib/vendor/lesson-body"

const LINK_CLASS = "text-link underline underline-offset-2 hover:opacity-80"

const HEADING: Record<2 | 3 | 4, { tag: ElementType; className: string }> = {
  2: { tag: "h2", className: "mt-2 text-xl font-semibold first:mt-0" },
  3: { tag: "h3", className: "mt-2 text-lg font-semibold first:mt-0" },
  4: { tag: "h4", className: "text-base font-semibold" },
}

const fileText = (node: LessonFileNode) => {
  const label = node.label ?? (node.name ? `Скачать ${node.name}` : "Скачать файл")

  return `${label} — ${node.ext}`
}

const isWebAddress = (href: string) => /^https?:/i.test(href)

function Inline({ nodes }: { nodes: LessonInline[] }) {
  return nodes.map((node, index) => {
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
      case "em":
        return <em key={index}>{node.value}</em>
      case "code":
        return (
          <code key={index} className="rounded bg-muted px-1 py-0.5">
            {node.value}
          </code>
        )
      case "image":
        return (
          <img key={index} src={node.src} alt={node.value} loading="lazy" className="my-4 h-auto w-full rounded-theme" />
        )
      case "file":
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
            data-testid="lesson-file-link"
          >
            {fileText(node)}
          </a>
        )
      case "page":
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {node.label ?? `Открыть ${node.host}`}
          </a>
        )
      case "link":
        return (
          <a
            key={index}
            href={node.href}
            target={isWebAddress(node.href) ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {node.value}
          </a>
        )
      default:
        return null
    }
  })
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case "heading": {
      const { tag: Tag, className } = HEADING[block.level]

      return (
        <Tag className={className}>
          <Inline nodes={block.content} />
        </Tag>
      )
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul"

      return (
        <Tag
          start={block.ordered && block.start !== 1 ? block.start : undefined}
          className={`${block.ordered ? "list-decimal" : "list-disc"} flex flex-col gap-y-2 ps-6 marker:text-muted-foreground`}
        >
          {block.items.map((nodes, index) => (
            <li key={index} className="ps-1">
              <Inline nodes={nodes} />
            </li>
          ))}
        </Tag>
      )
    }
    case "quote":
      return (
        <blockquote className="flex flex-col gap-y-2 rounded-e-theme border-s-2 border-primary bg-muted px-4 py-3">
          {block.lines.map((nodes, index) => (
            <p key={index} className="text-muted-foreground">
              <Inline nodes={nodes} />
            </p>
          ))}
        </blockquote>
      )
    default:
      return (
        <p>
          <Inline nodes={block.content} />
        </p>
      )
  }
}

/**
 * A lesson's text, read by the shop's own parser (`vendor/lesson-body.ts`), so
 * the owner's lists, headings, notes and file links read here the way they do
 * in the shop's account. Every text node is escaped by React; no HTML is built.
 */
export function LessonBody({ source, apiOrigin }: { source: string | null; apiOrigin: string | null }) {
  const blocks = parseLessonBody(source ?? "", { apiOrigin })

  if (blocks.length === 0) {
    return null
  }

  return (
    <div className="flex max-w-measure flex-col gap-y-4 text-base leading-relaxed" data-testid="lesson-body">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}
