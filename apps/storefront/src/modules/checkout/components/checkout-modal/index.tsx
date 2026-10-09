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
   * A sheet that has two panes to show at once (the CDEK picker's list and its
   * map, i03-checkout-pvz-map-address-suggest) gets the wider panel on a large
   * screen. Every other sheet keeps the 540 px it has always had, and the
   * mobile panel is full width either way.
   */
  wide?: boolean
  /**
   * A point picker (t-2026-10-09-56, Ivan 09.10: «на десктоп следует разворачивать окно
   * на весь экран и карту показывать размером 2/3»): from `small` up the panel fills the
   * whole screen and its body stretches to the bottom, so the sheet inside can give the
   * map two thirds of the width and the full height. Below `small` it is the same
   * bottom sheet as every other one.
   */
  fullscreen?: boolean
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
  fullscreen = false,
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
                fullscreen &&
                  "small:flex small:h-dvh small:max-h-none small:w-screen small:flex-col small:overflow-hidden small:rounded-none"
              )}
              data-fullscreen={fullscreen ? "" : undefined}
              data-compact={compact ? "" : undefined}
            >
              <div
                className={clx(
                  compact && "mx-auto flex w-full max-w-[352px] flex-col gap-y-4 p-4 sm:max-w-none sm:p-6",
                  fullscreen && "small:flex small:min-h-0 small:flex-1 small:flex-col"
                )}
              >
                <div className={clx("flex items-center justify-between", !compact && "px-6 py-4")}>
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
                    !compact && "px-6 pb-4",
                    fullscreen && "small:min-h-0 small:flex-1 small:pb-6"
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
