import { Badge, Text } from "@medusajs/ui"

import type { ImportRow, ImportRowAction } from "../../../hooks/api/product-csv"

const ACTION_LABEL: Record<ImportRowAction, string> = {
  create: "создать",
  create_variant: "новый вариант",
  update: "обновить",
  unchanged: "без изменений",
  reject: "ошибка",
}

const ACTION_COLOR: Record<ImportRowAction, "green" | "orange" | "grey" | "red"> = {
  create: "green",
  create_variant: "green",
  update: "orange",
  unchanged: "grey",
  reject: "red",
}

/**
 * The dry run, row by row, with the LINE NUMBER first (t14-product-import,
 * step 2). The line number is the whole point of the table: it is what the
 * owner types into Excel's «go to row» box to fix the cell being complained
 * about.
 *
 * Rows with something to say come first — errors, then changes — because a
 * hundred-line file is mostly «без изменений» and those lines are noise while
 * deciding.
 */
export const ImportRowsTable = ({ rows }: { rows: ImportRow[] }) => {
  const ordered = [...rows].sort((left, right) => {
    const weight = (row: ImportRow) =>
      row.action === "reject" ? 0 : row.action === "unchanged" ? 2 : 1
    return weight(left) - weight(right) || left.line - right.line
  })

  if (ordered.length === 0) {
    return null
  }

  return (
    <div className="border-ui-border-base divide-y overflow-hidden rounded-lg border">
      {ordered.map((row) => (
        <div key={row.line} className="flex flex-col gap-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Text size="small" className="text-ui-fg-muted font-mono">
              стр. {row.line}
            </Text>
            <Badge size="2xsmall" color={ACTION_COLOR[row.action]}>
              {ACTION_LABEL[row.action]}
            </Badge>
            <Text size="small" weight="plus">
              {row.title || row.handle || row.planned_handle || row.sku || "—"}
            </Text>
            {row.sku ? (
              <Text size="small" className="text-ui-fg-subtle font-mono">
                {row.sku}
              </Text>
            ) : null}
            {row.applied ? (
              <Badge size="2xsmall" color="green">
                применено
              </Badge>
            ) : null}
          </div>

          {row.errors.map((error, index) => (
            <Text key={index} size="small" className="text-ui-fg-error">
              {error.column ? `${error.column}: ` : ""}
              {error.message}
            </Text>
          ))}

          {row.changes.length > 0 ? (
            <div className="flex flex-col">
              {row.changes.map((change, index) => (
                <Text key={index} size="small" className="text-ui-fg-subtle">
                  {change.field}: <span className="line-through">{change.from || "пусто"}</span>{" "}
                  → <span className="text-ui-fg-base">{change.to}</span>
                </Text>
              ))}
            </div>
          ) : null}

          {row.notes.map((note, index) => (
            <Text key={index} size="small" className="text-ui-fg-subtle">
              {note}
            </Text>
          ))}

          {(row.images ?? []).map((image, index) => (
            <Text
              key={index}
              size="small"
              className={image.ok ? "text-ui-fg-subtle" : "text-ui-fg-error"}
            >
              {image.ok ? "картинка загружена" : "картинка не загружена"}: {image.url}
              {image.error ? ` — ${image.error}` : ""}
            </Text>
          ))}

          {row.apply_error ? (
            <Text size="small" className="text-ui-fg-error">
              Не удалось применить: {row.apply_error}
            </Text>
          ) : null}
        </div>
      ))}
    </div>
  )
}
