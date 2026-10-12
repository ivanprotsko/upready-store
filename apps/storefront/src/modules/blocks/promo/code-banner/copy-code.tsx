"use client"

import { clx } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"

/** What a press of the button did: the code is in the clipboard, or it is selected for the visitor to copy. */
export type CopyResult = "copied" | "selected"

/**
 * Copies `code` through the Clipboard API; where the browser has none or refuses (an insecure page, an
 * embedded view without the permission), selects the code instead, so the visitor copies it themselves.
 */
export async function copyCode(
  code: string,
  { writeText, select }: { writeText?: (text: string) => Promise<void>; select: () => void }
): Promise<CopyResult> {
  if (writeText) {
    try {
      await writeText(code)
      return "copied"
    } catch {
      // Refused: fall through to the selection.
    }
  }
  select()
  return "selected"
}

/** How long «Скопировано» stays, in milliseconds. */
const SAID_FOR = 2000

export type CopyCodeProps = {
  code: string
  labels: { copy: string; copied: string; selected: string; code: string }
  /** The tone's classes for the field and the button; the server picks them. */
  fieldClass: string
  buttonClass: string
}

/**
 * The code and its button, the one moving part of `promo/code-banner`. The code stands in a read-only
 * field, so the fallback can select it on any phone; a focus on the field selects it too. After a copy
 * the button says «Скопировано» for 2 s, and a polite live region says the same; both words stand in
 * the button's one grid cell from the first paint, the other one `invisible` and so out of its name, and
 * the button keeps its width.
 */
export default function CopyCode({ code, labels, fieldClass, buttonClass }: CopyCodeProps) {
  const field = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<CopyResult | null>(null)

  useEffect(() => {
    if (!result) return
    const timer = window.setTimeout(() => setResult(null), SAID_FOR)
    return () => window.clearTimeout(timer)
  }, [result])

  const select = () => {
    field.current?.focus()
    field.current?.setSelectionRange(0, code.length)
  }
  const onCopy = async () => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined
    setResult(await copyCode(code, { writeText: clipboard ? (text) => clipboard.writeText(text) : undefined, select }))
  }

  return (
    <div className="flex w-full flex-col gap-3 xsmall:w-auto xsmall:flex-row">
      <input
        ref={field}
        type="text"
        readOnly
        value={code}
        size={code.length + 1}
        aria-label={labels.code}
        data-role="promo-text"
        onFocus={(event) => event.currentTarget.select()}
        className={fieldClass}
      />
      <button type="button" data-role="cta-primary" onClick={onCopy} className={buttonClass}>
        <span className="grid">
          <span className={clx("col-start-1 row-start-1", result === "copied" && "invisible")}>{labels.copy}</span>
          <span className={clx("col-start-1 row-start-1", result !== "copied" && "invisible")}>{labels.copied}</span>
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {result === "copied" ? labels.copied : result === "selected" ? labels.selected : ""}
      </span>
    </div>
  )
}
