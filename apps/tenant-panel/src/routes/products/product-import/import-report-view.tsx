import { Button, Text, toast } from "@medusajs/ui"
import { useNavigate } from "react-router-dom"

import {
  useConfirmProductImport,
  useDeleteProductImport,
  type TenantProductImport,
} from "../../../hooks/api/product-csv"
import { ImportRowsTable } from "./import-rows-table"
import { ImportSummary } from "./import-summary"

const STATUS_TITLE: Record<string, string> = {
  pending: "Проверено. Ничего ещё не изменено",
  rejected: "Файл отклонён целиком — ничего не изменено",
  applied: "Импорт применён",
  partially_applied: "Импорт применён частично",
  cancelled: "Загрузка отменена",
}

/**
 * The stored dry run, and the one button that applies it (t14-product-import).
 *
 * Reads the report from the SERVER by id rather than keeping it in component
 * state, which is what makes «a page reload must not lose the report» true
 * instead of aspirational.
 */
export const ImportReportView = ({
  productImport,
}: {
  productImport: TenantProductImport
}) => {
  const navigate = useNavigate()
  const report = productImport.report
  const { mutateAsync: confirm, isPending: isConfirming } = useConfirmProductImport(
    productImport.id
  )
  const { mutateAsync: drop, isPending: isDropping } = useDeleteProductImport(
    productImport.id
  )

  if (!report) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Отчёт по этой загрузке не сохранён. Загрузите файл заново.
      </Text>
    )
  }

  const canApply =
    productImport.status === "pending" &&
    report.fatal.length === 0 &&
    report.summary.create + report.summary.create_variant + report.summary.update > 0

  const handleConfirm = async () => {
    await confirm(undefined, {
      onSuccess: ({ product_import }) => {
        const applied = product_import.report
        toast.success(
          product_import.status === "applied"
            ? "Каталог обновлён"
            : "Импорт остановился на полпути",
          {
            description: applied
              ? `создано ${applied.summary.create}, обновлено ${applied.summary.update}, без изменений ${applied.summary.unchanged}`
              : undefined,
          }
        )
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const handleDrop = async () => {
    await drop(undefined, {
      onSuccess: () => {
        toast.info("Загрузка удалена")
        navigate("/products", { replace: true })
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-1">
        <Text size="base" weight="plus">
          {STATUS_TITLE[productImport.status] ?? productImport.status}
        </Text>
        {productImport.status === "pending" ? (
          <Text size="small" className="text-ui-fg-subtle">
            Проверьте строки ниже и нажмите «Применить». До этого каталог не меняется.
          </Text>
        ) : null}
        {report.stopped_at_line ? (
          <Text size="small" className="text-ui-fg-error">
            Запись остановилась на строке {report.stopped_at_line}. Строки выше применены,
            ниже — нет.
          </Text>
        ) : null}
      </div>

      <ImportSummary report={report} />

      {report.fatal.length > 0 ? (
        <div className="border-ui-border-error bg-ui-bg-subtle flex flex-col gap-y-1 rounded-lg border p-3">
          <Text size="small" weight="plus" className="text-ui-fg-error">
            Файл нельзя применить целиком
          </Text>
          {report.fatal.map((fatal, index) => (
            <Text key={index} size="small" className="text-ui-fg-error">
              {fatal.line ? `Строка ${fatal.line}: ` : ""}
              {fatal.message}
            </Text>
          ))}
        </div>
      ) : null}

      {/*
        The actions sit ABOVE the table on purpose. A price list of five
        thousand rows makes «scroll to the bottom to confirm» a real cost, and
        the decision is made from the summary, not from the last line.
      */}
      <div className="border-ui-border-base flex items-center justify-end gap-x-2 border-t pt-4">
        <Button
          size="small"
          variant="secondary"
          onClick={handleDrop}
          isLoading={isDropping}
        >
          Удалить загрузку
        </Button>
        <Button
          size="small"
          variant="secondary"
          onClick={() => navigate("/products/import", { replace: true })}
        >
          Загрузить другой файл
        </Button>
        {canApply ? (
          <Button size="small" onClick={handleConfirm} isLoading={isConfirming}>
            Применить к каталогу
          </Button>
        ) : null}
      </div>

      <ImportRowsTable rows={report.rows} />
    </div>
  )
}
