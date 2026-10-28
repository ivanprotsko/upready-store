import { Text, clx } from "@medusajs/ui"
import { ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

export type SectionRowProps = {
  title: string
  value?: ReactNode | string | null
  actions?: ReactNode
  /**
   * `setting`: a settings screen's row (t-2026-10-20-30, Ivan 25.10 on
   * «Основной адрес» at 375: «не надо верстать в 2 колонки. заголовок сделать
   * светлее чем значение»). Below `sm` the label sits above its value in one
   * column; at every width the label is the subtle grey, the value the base ink.
   */
  variant?: "default" | "setting"
}

export const SectionRow = ({ title, value, actions, variant = "default" }: SectionRowProps) => {
  const setting = variant === "setting"
  const isValueString = typeof value === "string" || !value
  // o21-owner-panel-ux (P6): a long text (a product description) in half of a
  // phone screen is a column of three words per line. It goes under its label.
  const isLongText = typeof value === "string" && value.length > 80
  // A description of two thousand characters filled the first two screens of a
  // product, with its label in the middle of that wall. It starts folded, the
  // label stays at its top.
  const isWall = typeof value === "string" && value.length > 400
  const { t } = useTranslation()
  const [unfolded, setUnfolded] = useState(false)

  return (
    <div
      className={clx(
        `text-ui-fg-subtle grid w-full grid-cols-2 items-center gap-4 px-6 py-4`,
        {
          "grid-cols-[1fr_1fr_28px]": !!actions,
          "items-start": isLongText,
          "max-md:grid-cols-1 max-md:gap-1": isLongText && !actions,
          "max-sm:grid-cols-1 max-sm:items-start max-sm:gap-1": setting && !actions,
        }
      )}
    >
      <Text
        size="small"
        weight={setting ? "regular" : "plus"}
        leading="compact"
        className={clx({ "text-ui-fg-subtle": setting })}
      >
        {title}
      </Text>

      {isValueString ? (
        <div className="flex min-w-0 flex-col items-start gap-y-1">
          <Text
            size="small"
            leading="compact"
            className={clx("whitespace-pre-line text-pretty", {
              "line-clamp-6": isWall && !unfolded,
            })}
          >
            {value ?? "-"}
          </Text>
          {isWall ? (
            <button
              type="button"
              className="txt-compact-small-plus text-ui-fg-interactive max-md:min-h-11"
              aria-expanded={unfolded}
              onClick={() => setUnfolded((now) => !now)}
            >
              {unfolded ? t("actions.hide") : t("actions.showMore")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className={clx("flex flex-wrap gap-1 min-w-0", { "text-ui-fg-base": setting })}>
          {value}
        </div>
      )}

      {actions && <div>{actions}</div>}
    </div>
  )
}
