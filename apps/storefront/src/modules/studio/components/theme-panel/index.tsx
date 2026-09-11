"use client"

import { useEffect, useRef, useState } from "react"

import { Popover } from "./popover"
import { SlidersIcon } from "./icons"

import "../../styles/panel.css"

/**
 * The floating button bottom-left and the popover it opens.
 *
 * It renders only for a browser that carries the studio cookie, and that decision is
 * made on the server in studio-mount — a visitor's HTML contains neither this button
 * nor the popover.
 *
 * The button and the popover share ONE position: fixed root, and the popover is laid out
 * inside it as an ordinary block (bottom: 100%). No script measures a rect, and no
 * ancestor's transform, overflow or contain can move it — the two ways a popover usually
 * lands in the wrong place.
 */
export default function StudioPanel() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="upstudio upstudio-root" data-testid="studio-root">
      {open ? <Popover onClose={() => setOpen(false)} /> : null}
      <button
        type="button"
        className="upstudio-button"
        data-testid="studio-button"
        aria-expanded={open}
        aria-label="Studio panel"
        onClick={() => setOpen((was) => !was)}
      >
        <SlidersIcon />
      </button>
    </div>
  )
}
