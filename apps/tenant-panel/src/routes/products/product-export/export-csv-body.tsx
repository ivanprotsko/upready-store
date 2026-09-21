import { Button, Text, toast } from "@medusajs/ui"

import { RouteDrawer, useRouteModal } from "../../../components/modals"
import { useExportProductsCsv } from "../../../hooks/api/product-csv"

/**
 * The body of «Выгрузить каталог в CSV» (t14-product-import). Its own file
 * because `useRouteModal` has to be called inside `RouteDrawer`'s provider, so
 * the shell and the body cannot be one component.
 *
 * Design system: `@medusajs/ui`, like every other screen in this panel (it is a
 * fork of the Medusa Admin). A deliberate, pre-existing divergence from the
 * workspace Geist canon: two Geist-styled screens among a hundred Admin-styled
 * ones would read as a bug, and the divergence belongs to the panel as a whole
 * rather than to this task.
 */
export const ExportCsvBody = () => {
  const { handleSuccess } = useRouteModal()
  const { mutateAsync, isPending } = useExportProductsCsv()

  const handleExport = async () => {
    await mutateAsync(undefined, {
      onSuccess: ({ filename, text, count }) => {
        // The file arrives as text inside the panel's authenticated fetch, so
        // it is saved from the browser rather than opened by URL: a plain link
        // would be a second, unauthenticated request.
        const blob = new Blob([text], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")

        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)

        toast.success("Каталог выгружен", {
          description: `${filename} · товаров: ${count}`,
        })

        handleSuccess()
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      <RouteDrawer.Body className="flex flex-col gap-y-4">
        <Text size="small" className="text-ui-fg-subtle">
          В файле будет по одной строке на вариант товара: код товара, название,
          описание, статус, категория, артикул, цена, остаток, вес, габариты, ссылки на
          картинки и метаданные. Этот же файл принимает загрузка — правьте его в Excel
          или Google Таблицах и загружайте обратно.
        </Text>
        <div className="bg-ui-bg-subtle rounded-lg p-3">
          <Text size="small" weight="plus">
            Файл открывается в Excel без «мастера импорта»
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            Кодировка UTF-8 с BOM, разделитель «;» — русская Excel читает такой файл
            сразу. При загрузке обратно принимаются и «;», и «,», и файлы в кодировке
            Windows-1251.
          </Text>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Цена выгружается в валюте магазина. Цены в других валютах остаются как есть:
          загрузка их не трогает.
        </Text>
      </RouteDrawer.Body>
      <RouteDrawer.Footer>
        <div className="flex items-center gap-x-2">
          <RouteDrawer.Close asChild>
            <Button size="small" variant="secondary">
              Отмена
            </Button>
          </RouteDrawer.Close>
          <Button size="small" onClick={handleExport} isLoading={isPending}>
            Скачать CSV
          </Button>
        </div>
      </RouteDrawer.Footer>
    </>
  )
}
