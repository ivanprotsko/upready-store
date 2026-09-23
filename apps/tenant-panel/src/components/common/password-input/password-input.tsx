import { Eye, EyeSlash } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import * as React from "react"

// tenant-panel (t-2026-09-24-n3): `@medusajs/ui`'s own `Input` hardcodes its
// eye-toggle screen-reader text in English ("Show password" / "Hide
// password", see node_modules/@medusajs/ui/dist/esm/components/input/input.js)
// with no prop to override it. This wrapper reproduces that markup with
// Russian text for every password field the login screen and the panel
// render, so no English string reaches the accessibility tree either.
type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={clx(
            "caret-ui-fg-base bg-ui-bg-field hover:bg-ui-bg-field-hover shadow-borders-base placeholder-ui-fg-muted text-ui-fg-base transition-fg relative w-full appearance-none rounded-md outline-none",
            "focus-visible:shadow-borders-interactive-with-active",
            "disabled:text-ui-fg-disabled disabled:!bg-ui-bg-disabled disabled:placeholder-ui-fg-disabled disabled:cursor-not-allowed",
            "aria-[invalid=true]:!shadow-borders-error invalid:!shadow-borders-error",
            "txt-compact-small h-8 px-2 py-1.5 pr-8",
            className
          )}
          {...props}
        />
        <div className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center border-l">
          <button
            className="text-ui-fg-muted hover:text-ui-fg-base focus-visible:text-ui-fg-base focus-visible:shadow-borders-interactive-w-focus active:text-ui-fg-base h-fit w-fit rounded-sm outline-none transition-all"
            type="button"
            onClick={() => setVisible((current) => !current)}
          >
            <span className="sr-only">
              {visible ? "Скрыть пароль" : "Показать пароль"}
            </span>
            {visible ? <EyeSlash /> : <Eye />}
          </button>
        </div>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"
