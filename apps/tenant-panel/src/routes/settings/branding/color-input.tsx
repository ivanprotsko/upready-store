import { Input } from "@medusajs/ui"
import { ComponentPropsWithoutRef, forwardRef, useRef } from "react"
import { useTranslation } from "react-i18next"

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type ColorInputProps = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "size"> & {
  value: string
  onChange: (value: string) => void
}

/** t-2026-10-14-01 (panel redesign, G1 part 4): the colour is typed as #RRGGBB
 * into an `Input` with its swatch in front; a click on the swatch opens the
 * system colour picker (Ivan's answer to the prototype's question 4: no palette
 * of our own, and no bare native colour input on the screen). The picker's
 * input is hidden behind the swatch so the system popover opens next to it. */
export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
  ({ value, onChange, disabled, ...props }, ref) => {
    const { t } = useTranslation()
    const pickerRef = useRef<HTMLInputElement>(null)
    const valid = HEX_COLOR.test(value)

    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          placeholder="#1a2b3c"
          autoComplete="off"
          spellCheck={false}
          className="pl-10 font-mono"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={t("brandingSettings.fields.pickColor")}
          onClick={() => pickerRef.current?.click()}
          className="absolute left-2 top-1/2 h-5 w-6 -translate-y-1/2 rounded border border-ui-border-strong bg-ui-bg-component outline-none focus-visible:shadow-borders-focus"
          // The owner's own colour, the one value on this screen that is not a token.
          style={valid ? { backgroundColor: value } : undefined}
          data-testid="branding-color-swatch"
        />
        <input
          ref={pickerRef}
          type="color"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          value={valid ? value.toLowerCase() : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute left-2 top-1/2 h-5 w-6 -translate-y-1/2 opacity-0"
        />
      </div>
    )
  }
)
ColorInput.displayName = "ColorInput"
