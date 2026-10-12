"use client"

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react"
import { XMark } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"

interface CheckoutModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /**
   * A sheet that has two panes to show at once gets the wider panel on a large
   * screen. Every other sheet keeps the 540 px it has always had, and the
   * mobile panel is full width either way.
   */
  wide?: boolean
  /**
   * The pickup-point picker (t-2026-10-12-03, Ivan 12.10). Below `small` the panel takes the
   * whole screen with no rounded top, and the picker inside pins its head, tabs and fields
   * over a scrolling list (items 3.1, 3.2). From `small` up it is a large centred dialog
   * with margins on every side and rounded corners, the overlay visible around it (item 1:
   * «в всплывающем окне, с отступами по краям»), its body stretching to the bottom so the
   * map can take two thirds of the width and the full height (t-2026-10-09-56, item 9б).
   * `list` is the same dialog narrowed to a list, for a build without a map key.
   * The header gets a hairline under it and the body no padding: the picker lays out
   * its own edges, rows run edge to edge (item 3.5).
   */
  picker?: "split" | "list"
  /**
   * The sign-in modal (t-2026-10-04-45, Ivan 04.10: «Высота 40, скругления 8, ширина 320 …
   * Отступы вокруг внутри контейнера на десктоп 24 и планшете, на мобайл 16»). The content is a
   * 320 px column with 24 px all round from 640 px up, so the panel is 368 wide. On a phone the
   * sheet keeps its full width and the column inside it is 320 with 16 px all round, centred;
   * below 352 px the column narrows with the screen.
   */
  compact?: boolean
}

export function CheckoutModal({
  open,
  onClose,
  title,
  children,
  wide = false,
  compact = false,
  picker,
}: CheckoutModalProps) {
  const t = useTranslations("Common")

  return (
    <Transition show={open}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <TransitionChild
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-ui-bg-overlay backdrop-blur-[2px]"
            aria-hidden="true"
          />
        </TransitionChild>

        {/* Panel wrapper — bottom on mobile, centered on sm+ */}
        <div className="fixed inset-0 flex items-end sm:items-center justify-center">
          <TransitionChild
            enter="ease-out duration-250"
            enterFrom="opacity-0 translate-y-8 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-8 sm:translate-y-0 sm:scale-95"
          >
            <DialogPanel
              className={clx(
                "relative w-full max-h-[90dvh] overflow-y-auto bg-ui-bg-base rounded-t-xl sm:rounded-xl shadow-elevation-modal",
                compact ? "sm:w-[368px]" : "sm:w-[540px]",
                wide && "small:w-[880px]",
                picker &&
                  "flex h-dvh max-h-none w-screen flex-col overflow-hidden rounded-none sm:w-screen sm:rounded-none small:h-[calc(100dvh-4rem)] small:rounded-xl",
                picker === "split" && "small:w-[calc(100vw-4rem)] small:max-w-[1600px]",
                picker === "list" && "small:w-[640px]"
              )}
              data-picker={picker}
              data-compact={compact ? "" : undefined}
            >
              <div
                className={clx(
                  compact && "mx-auto flex w-full max-w-[352px] flex-col gap-y-4 p-4 sm:max-w-none sm:p-6",
                  picker && "flex min-h-0 flex-1 flex-col"
                )}
              >
                <div
                  className={clx(
                    "flex items-center justify-between",
                    !compact && !picker && "px-6 py-4",
                    picker && "shrink-0 gap-x-3 border-b border-ui-border-base px-4 py-3 small:px-6 small:py-4"
                  )}
                >
                  <DialogTitle className="txt-xlarge text-ui-fg-base">
                    {title}
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("close")}
                    className="text-ui-fg-muted hover:text-ui-fg-base transition-colors p-0.5"
                  >
                    <XMark />
                  </button>
                </div>
                <div
                  className={clx(
                    !compact && !picker && "px-6 pb-4",
                    picker && "flex min-h-0 flex-1 flex-col"
                  )}
                >
                  {children}
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
