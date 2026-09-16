import { useRef, useState } from "react"
import { Button, Text, Textarea, toast } from "@medusajs/ui"

import { sdk } from "../../../lib/client"
import { MarkdownPreview } from "./markdown-preview"

/**
 * The body of an article: a markdown field, a small toolbar, and a live
 * preview beside it (b18-blog-full).
 *
 * Before this the body was a bare `<Textarea rows={24}>` with a line of hints
 * under it — an owner wrote the text blind and found out what a `##` did only
 * after saving and opening the shop. The preview reads the source with the
 * SAME parser the storefront uses (`../../../lib/markdown`, pinned equal to the
 * storefront's copy by `pnpm check:shared-markdown`), so it cannot promise a
 * heading the page will not render.
 *
 * The toolbar writes markdown INTO the text rather than hiding it: the stored
 * body stays plain markdown, which is what the storefront renders, what the
 * import script wrote and what an owner can paste somewhere else. A picture is
 * uploaded through the same `POST /tenants/uploads` the cover uses — every file
 * lands under this tenant's own prefix — and is inserted as `![подпись](url)`
 * at the cursor.
 */

type Props = {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  /** Shown under the field; the form owns the error text. */
  invalid?: boolean
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

export const MarkdownEditor = ({ value, onChange, onBlur, invalid }: Props) => {
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const [showPreview, setShowPreview] = useState(true)
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
    const text = snippet.includes("%s") ? snippet.replace("%s", selected || "текст") : snippet
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
        toast.error("Загрузка не вернула адрес файла")
        return
      }
      insert(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`, { block: true })
      toast.success("Картинка вставлена в текст")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить картинку")
    } finally {
      setIsUploading(false)
      // The same file picked twice in a row still has to fire `change`.
      event.target.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <Button size="small" variant="transparent" type="button" onClick={() => insert("## %s", { block: true })}>
          Заголовок
        </Button>
        <Button size="small" variant="transparent" type="button" onClick={() => insert("**%s**")}>
          Жирный
        </Button>
        <Button size="small" variant="transparent" type="button" onClick={() => insert("_%s_")}>
          Курсив
        </Button>
        <Button size="small" variant="transparent" type="button" onClick={() => insert("- %s", { block: true })}>
          Список
        </Button>
        <Button size="small" variant="transparent" type="button" onClick={() => insert("> %s", { block: true })}>
          Врезка
        </Button>
        <Button size="small" variant="transparent" type="button" onClick={() => insert("[%s](https://)")}>
          Ссылка
        </Button>
        <Button size="small" variant="secondary" asChild isLoading={isUploading}>
          <label className="cursor-pointer">
            Картинка в текст
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
              data-testid="article-body-image-input"
            />
          </label>
        </Button>
        <div className="flex-1" />
        <Button
          size="small"
          variant="transparent"
          type="button"
          onClick={() => setShowPreview((shown) => !shown)}
          data-testid="article-preview-toggle"
        >
          {showPreview ? "Скрыть превью" : "Показать превью"}
        </Button>
      </div>

      <div className={showPreview ? "grid grid-cols-1 gap-3 large:grid-cols-2" : ""}>
        <Textarea
          ref={areaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          rows={24}
          className="font-mono"
          aria-invalid={invalid}
          placeholder={"## Подзаголовок\n\nАбзац текста.\n\n- пункт списка\n\n> выделенная врезка"}
          data-testid="article-body-input"
        />
        {showPreview ? (
          <div className="border-ui-border-base bg-ui-bg-subtle max-h-[560px] overflow-y-auto rounded-md border p-4">
            <MarkdownPreview source={value} />
          </div>
        ) : null}
      </div>

      <Text size="small" className="text-ui-fg-muted">
        Markdown: {"##"} — подзаголовок, {"-"} — пункт списка, {">"} — врезка, --- — разделитель,
        [текст](https://example.com) — ссылка, пустая строка между абзацами. Кнопки выше
        вставляют это за вас.
      </Text>
    </div>
  )
}
