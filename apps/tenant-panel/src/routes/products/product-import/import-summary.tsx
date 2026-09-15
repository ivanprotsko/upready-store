import { Badge, Text } from "@medusajs/ui"

import type { ImportReport } from "../../../hooks/api/product-csv"

const ENCODING_LABEL: Record<ImportReport["encoding"], string> = {
  "utf-8-bom": "UTF-8 с BOM (как пишет Excel)",
  "utf-8": "UTF-8",
  "windows-1251": "Windows-1251 (как пишет Excel в русской Windows)",
}

/**
 * The head of the dry-run report (t14-product-import): what the file is and
 * what confirming it would do.
 *
 * Every number carries its meaning in words, not a bare enum: «12 без
 * изменений» rather than `unchanged: 12` (rule 18e — a metric is a number, a
 * unit and a meaning).
 */
export const ImportSummary = ({ report }: { report: ImportReport }) => {
  const { summary } = report

  const counters: { label: string; value: number; tone?: "red" | "green" }[] = [
    { label: "создать товаров", value: summary.create, tone: "green" },
    { label: "новых вариантов", value: summary.create_variant, tone: "green" },
    { label: "обновить", value: summary.update },
    { label: "без изменений", value: summary.unchanged },
    { label: "с ошибкой", value: summary.reject, tone: "red" },
  ]

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="small" weight="plus">
          {report.filename}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {Math.max(1, Math.round(report.bytes / 1024))} КБ · строк с данными:{" "}
          {summary.rows} · разделитель «{report.delimiter === "\t" ? "таб" : report.delimiter}» ·{" "}
          {ENCODING_LABEL[report.encoding] ?? report.encoding}
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {counters
          .filter((counter) => counter.value > 0)
          .map((counter) => (
            <Badge
              key={counter.label}
              size="small"
              color={counter.tone === "red" ? "red" : counter.tone === "green" ? "green" : "grey"}
            >
              {counter.value} {counter.label}
            </Badge>
          ))}
        {counters.every((counter) => counter.value === 0) ? (
          <Text size="small" className="text-ui-fg-subtle">
            В файле нет строк с данными.
          </Text>
        ) : null}
      </div>

      {report.categories_to_create.length > 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          Будут созданы категории: {report.categories_to_create.join(", ")}
        </Text>
      ) : null}

      {report.unknown_columns.length > 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          Колонки, которых импорт не знает (они просто не применяются):{" "}
          {report.unknown_columns.join(", ")}
        </Text>
      ) : null}

      {summary.images > 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          Картинок к загрузке по ссылкам: {summary.images}
          {typeof summary.images_failed === "number"
            ? ` · не удалось скачать: ${summary.images_failed}`
            : ""}
        </Text>
      ) : null}
    </div>
  )
}
