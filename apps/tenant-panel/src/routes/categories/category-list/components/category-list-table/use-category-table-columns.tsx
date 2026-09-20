import { TriangleRightMini } from "@medusajs/icons"
import { AdminProductCategoryResponse } from "@medusajs/types"
import { IconButton, Text, clx } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { StatusCell } from "../../../../../components/table/table-cells/common/status-cell"
import {
  TextCell,
  TextHeader,
} from "../../../../../components/table/table-cells/common/text-cell"
import {
  getCategoryPath,
  getIsActiveProps,
  getIsInternalProps,
} from "../../../common/utils"

const columnHelper =
  createColumnHelper<AdminProductCategoryResponse["product_category"]>()

export const useCategoryTableColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => <TextHeader text={t("fields.name")} />,
        cell: ({ getValue, row }) => {
          const expandHandler = row.getToggleExpandedHandler()

          if (row.original.parent_category !== undefined) {
            const path = getCategoryPath(row.original)

            return (
              <div className="flex size-full items-center gap-1 overflow-hidden">
                {path.map((chip, index) => (
                  <div
                    key={chip.id}
                    className={clx("overflow-hidden", {
                      "text-ui-fg-muted flex items-center gap-x-1":
                        index !== path.length - 1,
                    })}
                  >
                    <Text size="small" leading="compact" className="truncate">
                      {chip.name}
                    </Text>
                    {index !== path.length - 1 && (
                      <Text size="small" leading="compact">
                        /
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )
          }

          return (
            <div className="flex size-full items-center gap-x-3 overflow-hidden">
              <div className="flex size-7 items-center justify-center">
                {row.getCanExpand() ? (
                  <IconButton
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()

                      expandHandler()
                    }}
                    size="small"
                    variant="transparent"
                    className="text-ui-fg-subtle"
                  >
                    <TriangleRightMini
                      className={clx({
                        "rotate-90 transition-transform will-change-transform":
                          row.getIsExpanded(),
                      })}
                    />
                  </IconButton>
                ) : null}
              </div>
              <span className="truncate">{getValue()}</span>
            </div>
          )
        },
      }),
      columnHelper.accessor("handle", {
        header: () => <TextHeader text={t("fields.handle")} />,
        cell: ({ getValue }) => {
          return <TextCell text={`/${getValue()}`} />
        },
      }),
      /**
       * The picture, as a picture. The owner uploads it in the edit drawer and the
       * storefront draws it on the category page, in the catalog and on the home
       * page; before f16-category-image-not-shown nothing in the panel said which
       * categories already had one, so "did my upload land?" had no answer short of
       * opening every category in turn.
       */
      columnHelper.display({
        id: "image",
        header: () => <TextHeader text={t("categories.edit.image")} />,
        cell: ({ row }) => {
          const metadata = (row.original.metadata ?? {}) as Record<string, unknown>
          const url =
            typeof metadata.image_url === "string" && metadata.image_url.trim()
              ? metadata.image_url
              : null

          if (!url) {
            return (
              <Text size="small" leading="compact" className="text-ui-fg-muted">
                {t("categories.fields.image.none")}
              </Text>
            )
          }

          return (
            <img
              src={url}
              alt=""
              loading="lazy"
              className="h-8 w-[26px] shrink-0 rounded object-cover"
            />
          )
        },
      }),
      columnHelper.accessor("is_active", {
        header: () => <TextHeader text={t("fields.status")} />,
        cell: ({ getValue }) => {
          const { color, label } = getIsActiveProps(getValue(), t)

          return <StatusCell color={color}>{label}</StatusCell>
        },
      }),
      columnHelper.accessor("is_internal", {
        header: () => (
          <TextHeader text={t("categories.fields.visibility.label")} />
        ),
        cell: ({ getValue }) => {
          const { color, label } = getIsInternalProps(getValue(), t)

          return <StatusCell color={color}>{label}</StatusCell>
        },
      }),
    ],
    [t]
  )
}
