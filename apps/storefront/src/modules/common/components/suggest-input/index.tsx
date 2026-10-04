"use client"

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { clx } from "@medusajs/ui"

import { FIELD_FOCUS, FIELD_SURFACE } from "@modules/common/components/input/field-classes"

/**
 * One suggest field for the checkout (i03-checkout-pvz-map-address-suggest).
 *
 * The mechanics Ivan asked for in order 3.2 — type, wait, pick — with the
 * source of the suggestions left to the caller, so the same control serves the
 * address form and the pickup sheet's city field, and so a paid provider can be
 * added later without touching the UI (see the report's `key missing:` line).
 *
 * What it guarantees, and what a test can hold it to:
 *  - nothing is fetched below `minChars` characters, and never on the keystroke
 *    itself: the term is debounced (`debounceMs`);
 *  - an answer for a term the buyer has already typed past is dropped — the
 *    requests are fired from an effect and can land out of order;
 *  - the keyboard is enough: ArrowDown/ArrowUp move, Enter picks, Escape closes
 *    and Tab leaves without picking;
 *  - typing on keeps the typed text — picking is what writes the structured
 *    fields, so manual entry always survives (f04-address-without-city).
 *
 * It is a `combobox` with a `listbox` popup, labelled and wired with
 * `aria-activedescendant`, because a suggest a screen reader cannot follow is
 * a suggest half the buyers do not get.
 */

export type SuggestInputProps<TItem> = {
  label: string
  value: string
  onValueChange: (text: string) => void
  onPick: (item: TItem) => void
  /** Runs debounced, only at or above `minChars`. Errors are treated as «no suggestions». */
  fetchItems: (term: string) => Promise<TItem[]>
  itemKey: (item: TItem) => string
  itemLabel: (item: TItem) => string
  itemHint?: (item: TItem) => string | null
  name?: string
  required?: boolean
  autoComplete?: string
  minChars?: number
  debounceMs?: number
  /** Rendered under the field while the popup is closed (a chosen point, a hint). */
  emptyHint?: string
  testId?: string
  className?: string
}

export default function SuggestInput<TItem>({
  label,
  value,
  onValueChange,
  onPick,
  fetchItems,
  itemKey,
  itemLabel,
  itemHint,
  name,
  required,
  autoComplete = "off",
  minChars = 3,
  debounceMs = 300,
  emptyHint,
  testId,
  className,
}: SuggestInputProps<TItem>) {
  const uid = useId()
  const listId = `${uid}-listbox`

  const [items, setItems] = useState<TItem[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /**
   * Which fetch the list on screen came from, and whether the buyer has just
   * picked. Without the second flag the pick itself (which writes the chosen
   * label into `value`) fires a new search for the text that was just accepted,
   * and the popup reopens under the buyer's hand.
   */
  const ticketRef = useRef(0)
  const justPickedRef = useRef(false)
  /**
   * Whether the field still has the caret when an answer lands. A popup that
   * opens over a field the buyer has already left covers whatever stands below
   * it — in the address sheet that is the Save button, which then cannot be
   * clicked at all (the same class as rule 19h: an async answer must not
   * override what the buyer has done since).
   */
  const focusedRef = useRef(false)

  const fetchRef = useRef(fetchItems)
  fetchRef.current = fetchItems

  const term = value.trim()

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false
      return
    }
    if (term.length < minChars) {
      ticketRef.current += 1
      setItems([])
      setOpen(false)
      setLoading(false)
      return
    }

    const ticket = ++ticketRef.current
    setLoading(true)
    const timer = setTimeout(() => {
      fetchRef
        .current(term)
        .then((answer) => {
          if (ticket !== ticketRef.current) return
          setItems(answer)
          setActive(-1)
          setOpen(focusedRef.current && answer.length > 0)
        })
        .catch(() => {
          if (ticket !== ticketRef.current) return
          setItems([])
          setOpen(false)
        })
        .finally(() => {
          if (ticket === ticketRef.current) setLoading(false)
        })
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [term, minChars, debounceMs])

  /**
   * The sheets this field lives in are `overflow-y-auto` boxes (the checkout
   * modal), so a popup opening near their bottom edge is clipped by the sheet
   * rather than by the window — measured on the stand 2026-09-16, where two and
   * a half of five cities were visible. Bringing the list into view scrolls the
   * sheet, not the page, and `block: "nearest"` leaves it alone when it already
   * fits.
   */
  useEffect(() => {
    if (!open || items.length === 0) return
    listRef.current?.scrollIntoView({ block: "nearest" })
  }, [open, items])

  // A click outside closes the popup. Pointerdown, not click: a click landing
  // on a button elsewhere would otherwise act with the list still covering it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const pick = useCallback(
    (item: TItem) => {
      justPickedRef.current = true
      ticketRef.current += 1
      setOpen(false)
      setItems([])
      setActive(-1)
      onPick(item)
    },
    [onPick]
  )

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }
    if (!open || items.length === 0) {
      // ArrowDown on a field with a term already typed reopens the last answer
      // instead of forcing the buyer to edit the text to see it again.
      if (event.key === "ArrowDown" && items.length > 0) setOpen(true)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((index) => (index + 1) % items.length)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1))
      return
    }
    if (event.key === "Enter" && active >= 0) {
      event.preventDefault()
      pick(items[active])
      return
    }
    if (event.key === "Tab") setOpen(false)
  }

  const activeId = useMemo(
    () => (open && active >= 0 && items[active] ? `${uid}-option-${active}` : undefined),
    [open, active, items, uid]
  )

  return (
    <div ref={rootRef} className={clx("relative flex w-full flex-col", className)}>
      {/* The same markup `modules/common/components/input` uses, so a suggest
          field standing next to a plain one in the same grid is the same field:
          the floating label is global CSS on `input ~ label`
          (`styles/globals.css`), which is why the input carries a blank
          placeholder and the label is its sibling. */}
      <div className="relative z-0 flex w-full txt-compact-medium">
        <input
          id={uid}
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete={autoComplete}
          required={required}
          placeholder=" "
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            focusedRef.current = true
            if (items.length > 0) setOpen(true)
          }}
          onBlur={() => {
            focusedRef.current = false
            // Picking a row cannot blur the field: the row's own pointerdown
            // calls preventDefault, so this only ever runs when the buyer has
            // really moved on.
            setOpen(false)
          }}
          className={clx(
            "mt-0 block h-11 w-full appearance-none px-4 pb-1 pt-4 text-ui-fg-base placeholder:text-ui-fg-muted",
            FIELD_SURFACE,
            FIELD_FOCUS
          )}
          data-testid={testId}
        />
        <label
          htmlFor={uid}
          className="origin-0 absolute top-3 -z-1 mx-3 flex items-center justify-center px-1 text-ui-fg-subtle transition-all duration-300"
        >
          {label}
          {required && <span className="text-ui-fg-error">*</span>}
        </label>
      </div>

      {emptyHint && !open && (
        <span className="px-1 pt-1 txt-compact-xsmall text-ui-fg-muted">{emptyHint}</span>
      )}

      {open && items.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base py-1 shadow-elevation-flyout"
          data-testid={testId ? `${testId}-options` : undefined}
        >
          {items.map((item, index) => {
            const hint = itemHint?.(item)
            return (
              <li
                key={itemKey(item)}
                id={`${uid}-option-${index}`}
                role="option"
                aria-selected={index === active}
                // Pointerdown, not click: a click fires after blur, and blur
                // closes the popup — the row would never be reached.
                onPointerDown={(event) => {
                  event.preventDefault()
                  pick(item)
                }}
                // Pointermove, not mouseenter: the popup opens UNDER a cursor
                // that has not moved, and `mouseenter` fires for that alone —
                // the row beneath the pointer became the active one, so the
                // buyer's first ArrowDown then skipped to the SECOND city
                // (measured on the stand 2026-09-16: «Москв» + ArrowDown +
                // Enter filled «Москворецкого Леспаркхоза»). A real move of the
                // mouse is what should take the highlight from the keyboard.
                onPointerMove={() => setActive(index)}
                className={clx(
                  "flex cursor-pointer flex-col gap-y-0.5 px-3 py-2 txt-compact-small text-ui-fg-base",
                  index === active && "bg-ui-bg-base-hover"
                )}
                data-testid={testId ? `${testId}-option` : undefined}
              >
                <span>{itemLabel(item)}</span>
                {hint && <span className="txt-compact-xsmall text-ui-fg-muted">{hint}</span>}
              </li>
            )
          })}
        </ul>
      )}

      {loading && (
        <span
          className="px-1 pt-1 txt-compact-xsmall text-ui-fg-muted"
          data-testid={testId ? `${testId}-loading` : undefined}
        >
          …
        </span>
      )}
    </div>
  )
}
