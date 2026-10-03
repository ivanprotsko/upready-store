"use client"

import { ChevronUpDown } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import {
  type SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

export type NativeSelectProps = {
  placeholder?: string
  /**
   * `"field"` (batch 6 part 1, lead's review of #239): the look of the form's `Input`
   * next to it, 44px high, the placeholder in the input label's colour and weight,
   * and the label floating small above once a value is chosen. `"compact"` is the
   * small select the sort, the quantity and the country pickers use.
   */
  variant?: "compact" | "field"
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
} & SelectHTMLAttributes<HTMLSelectElement>

const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    { placeholder, defaultValue, className, children, variant = "compact", ...props },
    ref
  ) => {
    const t = useTranslations("NativeSelect")
    const resolvedPlaceholder = placeholder ?? t("defaultPlaceholder")
    const innerRef = useRef<HTMLSelectElement>(null)
    const field = variant === "field"
    const [isPlaceholder, setIsPlaceholder] = useState(false)

    useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
      ref,
      () => innerRef.current
    )

    useEffect(() => {
      if (innerRef.current && innerRef.current.value === "") {
        setIsPlaceholder(true)
      } else {
        setIsPlaceholder(false)
      }
    }, [innerRef.current?.value])

    return (
      <div>
        <div
          onFocus={() => innerRef.current?.focus()}
          onBlur={() => innerRef.current?.blur()}
          className={clx(
            "relative flex items-center border border-ui-border-base rounded-md hover:bg-ui-bg-field-hover",
            field
              ? "h-11 txt-compact-medium bg-ui-bg-field"
              : "txt-compact-small-plus bg-ui-bg-subtle",
            className,
            {
              "text-ui-fg-muted": isPlaceholder && !field,
            }
          )}
        >
          <select
            ref={innerRef}
            defaultValue={defaultValue}
            aria-label={resolvedPlaceholder}
            {...props}
            // `min-w-0`: a select's own minimum width is its longest option; the
            // checkout's region list made it 391px and pushed the page 18px past a
            // 390px phone (measured on the stand, batch 6 part 1).
            className={clx(
              "appearance-none min-w-0 flex-1 bg-transparent border-none transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              field
                ? clx(
                    "self-stretch rounded-md ps-4 pe-10",
                    // Empty: the placeholder sits where `Input` puts its label, in
                    // its colour. Chosen: the value sits low, the label floats above.
                    isPlaceholder ? "text-ui-fg-subtle" : "pt-4 pb-1 text-ui-fg-base"
                  )
                : "px-2 py-1 text-ui-fg-base"
            )}
          >
            <option disabled value="">
              {resolvedPlaceholder}
            </option>
            {children}
          </select>
          {/* The same red mark `Input` puts after a required field's label,
              placed right after the placeholder: an invisible copy of its
              text holds the width (U-08, 46df). */}
          {props.required && isPlaceholder && (
            <span
              aria-hidden
              className={clx(
                "absolute inset-y-0 flex items-center pointer-events-none",
                field ? "start-4" : "start-2"
              )}
              data-testid="native-select-required-mark"
            >
              <span className="invisible">{resolvedPlaceholder}</span>
              <span className="text-ui-fg-error">*</span>
            </span>
          )}
          {/* `Input`'s own floated label: 4px from the top, `text-xsmall-regular`. */}
          {field && !isPlaceholder && (
            <span
              aria-hidden
              className="absolute start-4 top-1 text-xsmall-regular text-ui-fg-subtle pointer-events-none"
              data-testid="native-select-floating-label"
            >
              {resolvedPlaceholder}
              {props.required && <span className="text-ui-fg-error">*</span>}
            </span>
          )}
          <span
            className={clx(
              "absolute inset-y-0 flex items-center pointer-events-none",
              field ? "end-3" : "end-2"
            )}
          >
            <ChevronUpDown className="text-ui-fg-muted" />
          </span>
        </div>
      </div>
    )
  }
)

NativeSelect.displayName = "NativeSelect"

export default NativeSelect
