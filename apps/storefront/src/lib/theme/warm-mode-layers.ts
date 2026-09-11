"use client"

/**
 * Loads the image layers the next mode will show, before the attribute flips.
 *
 * A paired image keeps both versions in the markup and hides one with `display:none`
 * (`modules/common/components/mode-image`). The hidden layer is `loading="lazy"`, which is
 * what makes it free — measured on Chromium, WebKit and Firefox, such an image is not
 * requested at all until something shows it. The flip would therefore un-hide an image
 * that has not started loading, and the frame would stand empty for the length of the
 * request. Warming it first removes that gap.
 *
 * Two measured facts decide how (`artifacts/docs/mode-image-pairs/measure-warm.cjs`):
 *
 *   - setting `loading = "eager"` on a hidden lazy image DOES start the request, in all
 *     three engines, without showing it;
 *   - `img.decode()` does NOT — Chromium and WebKit never answer (measured past 800 ms)
 *     and Firefox rejects with `EncodingError`. So the readiness signal is `load`.
 *
 * Only layers whose frame is near the viewport are warmed: an image far below the fold is
 * exactly what `lazy` exists for, and waiting on twenty of them would delay the click it
 * is meant to smooth. The wait is capped, so the mode always flips — warm or not.
 */
const WARM_TIMEOUT_MS = 400

export async function warmModeLayers(mode: string): Promise<void> {
  if (typeof document === "undefined") {
    return
  }

  const viewport = window.innerHeight
  const pending: HTMLImageElement[] = []

  for (const layer of Array.from(
    document.querySelectorAll<HTMLElement>(`[data-mode-image="${mode}"]`)
  )) {
    // The layer itself is `display:none`, so its own rect is all zeros — the frame around
    // it is what has a position on the page.
    const frame = layer.parentElement
    const box = frame?.getBoundingClientRect()
    if (!box || box.bottom < -viewport * 0.25 || box.top > viewport * 1.25) {
      continue
    }
    const image = layer.querySelector("img")
    if (image && !image.complete) {
      pending.push(image)
    }
  }

  if (!pending.length) {
    return
  }

  await Promise.race([
    Promise.all(
      pending.map((image) => {
        image.loading = "eager"
        return image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true })
              // A frame that fails to load must not hold the mode hostage.
              image.addEventListener("error", () => resolve(), { once: true })
            })
      })
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, WARM_TIMEOUT_MS)
    }),
  ])
}
