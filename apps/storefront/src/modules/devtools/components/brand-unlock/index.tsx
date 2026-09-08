"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import "../../styles/panel.css"

/**
 * The door to the hidden settings panel: a two-second press on the brand element.
 *
 * It wraps the existing logo link instead of replacing it, in `display: contents`, so the
 * navigation's layout is untouched and a visitor sees nothing at all — no cursor change,
 * no highlight, no progress ring. A press shorter than two seconds stays an ordinary
 * navigation to "/"; a press that moves more than ten pixels is a drag or a scroll and
 * cancels; only the timer firing opens the password dialog, and the click that follows
 * that press is swallowed once so the storefront does not navigate out from under it.
 *
 * The dialog is a native <dialog> opened with showModal(): the browser gives us the top
 * layer (so no ancestor's transform, overflow or z-index can move it), the focus trap,
 * Esc and the backdrop for free. The storefront's own modal primitive is a Headless-UI
 * transition dressed in Medusa tokens — the wrong clothes for a tool that has to look the
 * same under all seven presets.
 *
 * Nothing here knows the password: it posts to /api/devtools/unlock and reads a status
 * code. With the feature switched off the route answers 404 and the dialog says so.
 */

const HOLD_MS = 2000
const MOVE_TOLERANCE_PX = 10

export default function BrandUnlock({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // The dialog is mounted only after a hold has actually fired. Rendering it up front
  // would put "Storefront devtools / Password / Unlock" into the HTML of every visitor —
  // markup nobody can use, advertising a door that is supposed to be invisible.
  const [armed, setArmed] = useState(false)

  const cancelHold = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    originRef.current = null
  }, [])

  useEffect(() => cancelHold, [cancelHold])

  // showModal() cannot run in the same tick as the state change that mounts the dialog:
  // the element does not exist yet. This effect is that second tick.
  useEffect(() => {
    if (!armed) return
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    inputRef.current?.focus()
  }, [armed])

  const onPointerDown = (event: React.PointerEvent) => {
    // Only the primary button arms the hold; a right click keeps its context menu.
    if (event.button !== 0) return
    firedRef.current = false
    cancelHold()
    originRef.current = { x: event.clientX, y: event.clientY }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      originRef.current = null
      firedRef.current = true
      setError(null)
      setArmed(true)
    }, HOLD_MS)
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const origin = originRef.current
    if (!origin) return
    const moved = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
    if (moved > MOVE_TOLERANCE_PX) cancelHold()
  }

  const onContextMenu = (event: React.MouseEvent) => {
    // A long touch would otherwise raise the OS callout and cancel the pointer stream.
    if (originRef.current) event.preventDefault()
  }

  const onClickCapture = (event: React.MouseEvent) => {
    if (!firedRef.current) return
    firedRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const password = inputRef.current?.value ?? ""
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/devtools/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        dialogRef.current?.close()
        if (inputRef.current) inputRef.current.value = ""
        // the cookie is httpOnly, so only a server render can decide to show the button
        router.refresh()
        return
      }
      setError(
        res.status === 404
          ? "Devtools are not available on this storefront."
          : "That password does not match."
      )
      inputRef.current?.select()
    } catch {
      setError("The storefront did not answer. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <span
      className="updev-brand-hold"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onContextMenu={onContextMenu}
      onClickCapture={onClickCapture}
    >
      {children}
      {armed ? (
        <dialog
          ref={dialogRef}
          className="updev updev-dialog"
          data-testid="devtools-unlock-dialog"
          onClose={() => {
            setError(null)
            setArmed(false)
          }}
        >
          <form onSubmit={submit}>
            <span className="updev-eyebrow">Storefront devtools</span>
            <div className="updev-field">
              <label className="updev-label" htmlFor="updev-password">
                Password
              </label>
              <input
                ref={inputRef}
                id="updev-password"
                className="updev-input"
                data-testid="devtools-password"
                type="password"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
              />
            </div>
            {error ? (
              <p
                className="updev-error"
                data-testid="devtools-unlock-error"
                role="alert"
              >
                <span className="updev-dot" aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <div className="updev-dialog-actions">
              <button
                type="submit"
                className="updev-primary"
                data-testid="devtools-unlock-submit"
                disabled={pending}
              >
                {pending ? "Checking…" : "Unlock"}
              </button>
            </div>
            <p className="updev-hint">
              Esc closes. Nothing is stored until the password checks out.
            </p>
          </form>
        </dialog>
      ) : null}
    </span>
  )
}
