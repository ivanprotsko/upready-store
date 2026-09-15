import { Button, Text, toast } from "@medusajs/ui"
import { useRef, useState } from "react"

import {
  useProductImports,
  useUploadProductImport,
} from "../../../hooks/api/product-csv"

/**
 * The upload step of «Загрузить CSV» (t14-product-import, step 8): pick a file,
 * get a dry run.
 *
 * THE LIMITS ARE STATED BEFORE THE UPLOAD, not after it. They come from the
 * backend (`GET /tenants/products/import` answers them next to the list), so
 * the number on the screen is the number that is enforced, and an owner with a
 * 40 MB price list learns it here instead of from a failed upload.
 */
export const ImportUpload = ({
  onUploaded,
}: {
  onUploaded: (importId: string) => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const { limits } = useProductImports()
  const { mutateAsync, isPending } = useUploadProductImport()

  const maxMb = limits ? Math.round(limits.max_bytes / 1024 / 1024) : null
  const maxRows = limits?.max_rows ?? null

  const upload = async (file: File | undefined) => {
    if (!file) {
      return
    }

    await mutateAsync(file, {
      onSuccess: ({ product_import }) => onUploaded(product_import.id),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div className="flex flex-col gap-y-4">
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          void upload(event.dataTransfer?.files?.[0])
        }}
        className={`border-ui-border-strong flex w-full flex-col items-center justify-center gap-y-2 rounded-lg border border-dashed p-8 transition-colors ${
          dragOver ? "bg-ui-bg-base-hover" : "bg-ui-bg-subtle"
        }`}
      >
        <Text size="small" weight="plus">
          {isPending ? "Проверяем файл…" : "Перетащите CSV или нажмите, чтобы выбрать"}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          Ничего не изменится, пока вы не подтвердите — сначала покажем отчёт по строкам
        </Text>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        hidden
        onChange={(event) => {
          void upload(event.target.files?.[0])
          event.target.value = ""
        }}
      />

      <div className="bg-ui-bg-subtle flex flex-col gap-y-1 rounded-lg p-3">
        <Text size="small" weight="plus">
          Что принимает загрузка
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          CSV{maxMb ? ` до ${maxMb} МБ` : ""}
          {maxRows ? `, до ${maxRows.toLocaleString("ru-RU")} строк` : ""}. Разделитель
          «;» или «,», кодировка UTF-8 (с BOM и без) или Windows-1251 — определяется по
          файлу. XLSX пока не читается: в Excel сохраните как «CSV UTF-8».
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          Пустая клетка означает «не менять». Товар, которого нет в каталоге, создаётся
          черновиком — опубликуете его сами, проверив карточку.
        </Text>
      </div>

      <div className="flex justify-end">
        <Button
          size="small"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          isLoading={isPending}
        >
          Выбрать файл
        </Button>
      </div>
    </div>
  )
}
