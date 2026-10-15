import { useRef, useState } from "react"
import { Button, Text, Textarea, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { sdk } from "../../../lib/client"

/**
 * The body of an article or a page: a markdown field and a small toolbar
 * (b18-blog-full).
 *
 * Before this the body was a bare `<Textarea rows={24}>` with a line of hints
 * under it — an owner wrote the text blind and found out what a `##` did only
 * after saving and opening the shop.
 *
 * The toolbar writes markdown INTO the text rather than hiding it: the stored
 * body stays plain markdown, which is what the storefront renders, what the
 * import script wrote and what an owner can paste somewhere else. A picture is
 * uploaded through the same `POST /tenants/uploads` the cover uses — every file
 * lands under this tenant's own prefix — and is inserted as `![name](url)` at
 * the cursor.
 *
 * t-2026-10-14-01 (panel redesign, G4, prototype states `pages-edit` and
 * `journal-edit`): the preview left this field for the right half of the
 * editor window (`editor-split.tsx`), so the editor only says whether it is
 * shown and asks to toggle it. Every word is a catalogue key.
 */

type Props = {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  /** Shown under the field; the form owns the error text. */
  invalid?: boolean
  previewShown: boolean
  onTogglePreview: () => void
}

const uploadImage = async (file: File): Promise<string | undefined> => {
  const form = new FormData()
  form.append("files", file)

  const { files } = await sdk.client.fetch<{ files: Array<{ url?: string }> }>(
    "/tenants/uploads",
    { method: "POST", headers: { "Content-Type": null }, body: form }
  )

  return files?.[0]?.url
}

/** The toolbar, in the prototype's order; `%s` is the selection or a placeholder word. */
const TOOLS = [
  { key: "heading", snippet: "## %s", block: true },
  { key: "bold", snippet: "**%s**", block: false },
  { key: "italic", snippet: "_%s_", block: false },
  { key: "list", snippet: "- %s", block: true },
  { key: "quote", snippet: "> %s", block: true },
  { key: "link", snippet: "[%s](https://)", block: false },
] as const

export const MarkdownEditor = ({
  value,
  onChange,
  onBlur,
  invalid,
  previewShown,
  onTogglePreview,
}: Props) => {
  const { t } = useTranslation()
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  /**
   * Inserts at the caret and leaves the caret after what was inserted, so a
   * second click does not overwrite the first insert. When the field has never
   * been focused the caret is at 0 and the text lands at the top, which is
   * where an owner who clicked the button first expects it.
   */
  const insert = (snippet: string, { block = false }: { block?: boolean } = {}) => {
    const area = areaRef.current
    const start = area?.selectionStart ?? value.length
    const end = area?.selectionEnd ?? value.length
    const selected = value.slice(start, end)

    const prefix = block && start > 0 && !value.slice(0, start).endsWith("\n\n") ? "\n\n" : ""
    const text = snippet.includes("%s")
      ? snippet.replace("%s", selected || t("markdownEditor.snippet"))
      : snippet
    const next = `${value.slice(0, start)}${prefix}${text}${block ? "\n\n" : ""}${value.slice(end)}`

    onChange(next)

    const caret = start + prefix.length + text.length + (block ? 2 : 0)
    window.requestAnimationFrame(() => {
      area?.focus()
      area?.setSelectionRange(caret, caret)
    })
  }

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const url = await uploadImage(file)
      if (!url) {
        toast.error(t("markdownEditor.uploadNoUrl"))
        return
      }
      insert(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`, { block: true })
      toast.success(t("markdownEditor.imageInserted"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("markdownEditor.imageFailed"))
    } finally {
      setIsUploading(false)
      // The same file picked twice in a row still has to fire `change`.
      event.target.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {TOOLS.map((tool) => (
          <Button
            key={tool.key}
            size="small"
            variant="secondary"
            type="button"
            onClick={() => insert(tool.snippet, { block: tool.block })}
          >
            {t(`markdownEditor.tools.${tool.key}`)}
          </Button>
        ))}
        <Button size="small" variant="secondary" asChild isLoading={isUploading}>
          <label className="cursor-pointer">
            {t("markdownEditor.tools.image")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
              data-testid="article-body-image-input"
            />
          </label>
        </Button>
        <Button
          size="small"
          variant="secondary"
          type="button"
          onClick={onTogglePreview}
          data-testid="article-preview-toggle"
        >
          {previewShown ? t("markdownEditor.hidePreview") : t("markdownEditor.showPreview")}
        </Button>
      </div>

      <Textarea
        ref={areaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={24}
        className="font-mono"
        aria-invalid={invalid}
        placeholder={t("markdownEditor.placeholder")}
        data-testid="article-body-input"
      />

      <Text size="small" className="text-ui-fg-muted text-pretty">
        {t("markdownEditor.hint")}
      </Text>
    </div>
  )
}
