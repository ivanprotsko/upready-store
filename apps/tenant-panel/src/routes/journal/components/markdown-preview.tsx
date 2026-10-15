import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { MarkdownBlock, MarkdownInline } from "../../../lib/markdown"
import { parseMarkdown } from "../../../lib/markdown"

/**
 * The live preview of an article body (b18-blog-full).
 *
 * It reads the source with THE SAME parser the storefront uses — the file is
 * byte-identical in both apps and pinned by `pnpm check:shared-markdown` — so
 * what the owner sees while typing is what the page will show. The elements
 * differ from the storefront's on purpose: this is a panel, styled with
 * `@medusajs/ui` tokens, and its job is to answer «did my heading become a
 * heading», not to be a pixel copy of a shop theme the panel does not load.
 *
 * No `dangerouslySetInnerHTML` here either: the text is the tenant's own and
 * React escapes every text node, so markup in the source stays literal text.
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
            <code key={index} className="bg-ui-bg-subtle rounded px-1 py-0.5 font-mono text-xs">
              {node.value}
            </code>
          )
        case "link":
          return (
            <a
              key={index}
              href={node.href}
              target="_blank"
              rel="noreferrer"
              className="text-ui-fg-interactive underline"
            >
              {node.value}
            </a>
          )
        case "image":
          return (
            <img
              key={index}
              src={node.src}
              alt={node.value}
              className="border-ui-border-base my-3 h-auto w-full rounded-md border"
            />
          )
        default:
          return <span key={index}>{node.value}</span>
      }
    })}
  </>
)

const Block = ({ block }: { block: MarkdownBlock }) => {
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? "text-xl" : block.level === 2 ? "text-lg" : "text-base"
      return (
        <p className={`${size} text-ui-fg-base mt-4 font-semibold first:mt-0`}>
          <Inline nodes={block.content} />
        </p>
      )
    }
    case "list":
      return block.ordered ? (
        <ol className="text-ui-fg-base my-2 list-decimal pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="text-ui-fg-base my-2 list-disc pl-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      )
    case "quote":
      return (
        <blockquote className="border-ui-border-strong text-ui-fg-subtle my-3 border-l-2 pl-3">
          {block.content.map((line, index) => (
            <p key={index}>
              <Inline nodes={line} />
            </p>
          ))}
        </blockquote>
      )
    case "rule":
      return <hr className="border-ui-border-base my-4" />
    case "table":
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-ui-border-base border-b">
                {block.header.map((cell, index) => (
                  <th key={index} className="text-ui-fg-base px-2 py-1 font-medium">
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-ui-border-base border-b last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="text-ui-fg-subtle px-2 py-1">
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return (
        <p className="text-ui-fg-base my-2 leading-relaxed">
          <Inline nodes={block.content} />
        </p>
      )
  }
}

export const MarkdownPreview = ({ source }: { source: string }) => {
  const { t } = useTranslation()
  const blocks = parseMarkdown(source ?? "")

  // An empty body is an empty body, not a broken preview: say so in words
  // rather than render nothing and leave the owner guessing (rule 20a).
  if (blocks.length === 0) {
    return (
      <Text size="small" className="text-ui-fg-muted">
        {t("markdownEditor.previewEmpty")}
      </Text>
    )
  }

  return (
    <div data-testid="article-preview">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}
