import type { ReactNode } from "react"
import { Text, clx } from "@medusajs/ui"

import { MarkdownPreview } from "./markdown-preview"

/**
 * The «Текст» tab of the page and article editors (t-2026-10-14-01, panel
 * redesign G4, prototype states `pages-edit` and `journal-edit`): the fields
 * on the left, and on the right what the customer will see — the title and the
 * body drawn by the storefront's own markdown parser, with the address the
 * page opens at. Below `lg` the preview follows the fields; hidden, the fields
 * take the whole width.
 */

type EditorSplitProps = {
  previewShown: boolean
  /** «Так увидит покупатель» or «Так увидит читатель». */
  previewLabel: string
  title: string
  body: string
  /** The address on the storefront: what the owner reads, and the link when there is a host. */
  address?: { label: string; href?: string }
  children: ReactNode
}

export const EditorSplit = ({
  previewShown,
  previewLabel,
  title,
  body,
  address,
  children,
}: EditorSplitProps) => (
  <div
    className={clx("size-full overflow-y-auto", {
      "lg:grid lg:grid-cols-2 lg:overflow-hidden": previewShown,
    })}
  >
    <div className="flex flex-col gap-y-6 px-8 py-8 max-md:px-4 max-md:py-6 lg:overflow-y-auto">
      {children}
    </div>
    {previewShown ? (
      <div
        className="bg-ui-bg-subtle border-ui-border-base flex flex-col gap-y-4 border-t px-8 py-8 max-md:px-4 lg:overflow-y-auto lg:border-l lg:border-t-0"
        data-testid="editor-preview"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="small" className="text-ui-fg-subtle">
            {previewLabel}
          </Text>
          {address?.href ? (
            <a
              href={address.href}
              target="_blank"
              rel="noreferrer"
              className="txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base min-w-0 truncate transition-fg"
            >
              {address.label} ↗
            </a>
          ) : address ? (
            <Text size="small" className="text-ui-fg-subtle min-w-0 truncate">
              {address.label}
            </Text>
          ) : null}
        </div>
        <div className="bg-ui-bg-base shadow-elevation-card-rest rounded-lg px-8 py-8 max-md:px-4">
          {title.trim() ? (
            <h1 className="text-ui-fg-base mb-4 text-2xl font-medium leading-tight">{title}</h1>
          ) : null}
          <MarkdownPreview source={body} />
        </div>
      </div>
    ) : null}
  </div>
)
