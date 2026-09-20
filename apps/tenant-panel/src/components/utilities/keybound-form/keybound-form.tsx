import React from "react"

/**
 * The control the user is still editing hands its value to the form on blur.
 * Every data-grid cell (prices, stock, variant tables) is built that way, and a
 * submit that never blurs the cell used to drop the freshly typed value without
 * a word: Cmd/Ctrl+Enter submits straight from inside the cell, and so does a
 * click on a button that a browser does not focus. Blurring the focused control
 * first fires that commit synchronously, before the form is read.
 *
 * tenant-panel: not in @medusajs/dashboard 2.19.0, see f10-price-save-silently-lost.
 */
const flushFocusedControl = (form: HTMLFormElement) => {
  const active = document.activeElement

  const isEditableControl =
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement

  if (!isEditableControl || !form.contains(active)) {
    return
  }

  active.blur()
}

/**
 * A form that can only be submitted when using the meta or control key.
 */
export const KeyboundForm = React.forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>(({ onSubmit, onKeyDown, ...rest }, ref) => {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    flushFocusedControl(event.currentTarget)

    onSubmit?.(event)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter") {
      if (
        event.target instanceof HTMLTextAreaElement &&
        !(event.metaKey || event.ctrlKey)
      ) {
        return
      }

      event.preventDefault()

      if (event.metaKey || event.ctrlKey) {
        handleSubmit(event)
      }
    }
  }

  return (
    <form
      {...rest}
      onSubmit={handleSubmit}
      onKeyDown={onKeyDown ?? handleKeyDown}
      ref={ref}
    />
  )
})

KeyboundForm.displayName = "KeyboundForm"
