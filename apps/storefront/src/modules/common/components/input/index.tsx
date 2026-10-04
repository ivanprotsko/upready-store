import { Label, clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import React, { useEffect, useImperativeHandle, useId, useState } from "react"

import Eye from "@modules/common/icons/eye"
import EyeOff from "@modules/common/icons/eye-off"

import { FIELD_FOCUS, FIELD_SURFACE } from "./field-classes"

type InputProps = Omit<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  "placeholder"
> & {
  label: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
  name: string
  topLabel?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type, name, label, touched: _touched, required, topLabel, ...props }, ref) => {
    const t = useTranslations("Common")
    const inputRef = React.useRef<HTMLInputElement>(null)
    const generatedId = useId()
    const inputId = props.id ?? `${name}-${generatedId}`
    const [showPassword, setShowPassword] = useState(false)
    const [inputType, setInputType] = useState(type)

    useEffect(() => {
      if (type === "password" && showPassword) {
        setInputType("text")
      }

      if (type === "password" && !showPassword) {
        setInputType("password")
      }
    }, [type, showPassword])

    useImperativeHandle(ref, () => inputRef.current!)

    return (
      <div className="flex flex-col w-full">
        {topLabel && (
          <Label className="mb-2 txt-compact-medium-plus">{topLabel}</Label>
        )}
        <div className="flex relative z-0 w-full txt-compact-medium">
          <input
            type={inputType}
            id={inputId}
            name={name}
            placeholder=" "
            required={required}
            className={clx(
              "pt-4 pb-1 block w-full h-11 px-4 mt-0 appearance-none text-ui-fg-base placeholder:text-ui-fg-muted",
              FIELD_SURFACE,
              FIELD_FOCUS
            )}
            {...props}
            ref={inputRef}
          />
          <label
            htmlFor={inputId}
            onClick={() => inputRef.current?.focus()}
            className="flex items-center justify-center mx-3 px-1 transition-all absolute duration-300 top-3 -z-1 origin-0 text-ui-fg-subtle"
          >
            {label}
            {required && <span className="text-ui-fg-error">*</span>}
          </label>
          {type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={t(showPassword ? "hidePassword" : "showPassword")}
              aria-pressed={showPassword}
              className="text-ui-fg-subtle px-4 flex items-center justify-center focus:outline-none transition-all duration-150 outline-none focus:text-ui-fg-base absolute end-0 inset-y-0 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {showPassword ? <Eye /> : <EyeOff />}
            </button>
          )}
        </div>
      </div>
    )
  }
)

Input.displayName = "Input"

export default Input
