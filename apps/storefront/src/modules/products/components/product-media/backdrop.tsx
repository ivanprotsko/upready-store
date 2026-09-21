import Image from "next/image"

/**
 * What a product frame shows around a photo whose ratio is not the frame's: the photo's
 * own outermost pixels, continued to the frame's edge, the way a texture is clamped.
 *
 * Four wedges meet in the centre of the frame. Each holds the same 64px file stretched
 * 32 times along one axis and anchored to its side, so all that is visible of it is the
 * file's outermost column (left and right wedges) or row (top and bottom wedges), smeared
 * across the wedge. A strip beside a white packshot is therefore white, and a strip beside
 * a full-bleed infographic repeats, row by row, the colours the infographic ends with.
 *
 * A blurred, zoomed copy of the photo was tried first and painted grey bands beside white
 * packshots, because the blur drags the dark product from the centre into the strips; a
 * copy stretched with `object-fit: fill` shows the outer eighth of the photo instead of its
 * edge (measured by `e2e/image-letterbox.e2e.mjs`).
 *
 * Decoration only: one request per photo, hidden from assistive technology, and skipped by
 * the framing probe through `data-product-media-backdrop`.
 */
const WEDGES = [
  { clip: "polygon(0 0, 50% 50%, 0 100%)", box: "left-0 top-0 h-full w-[3200%]" },
  { clip: "polygon(100% 0, 50% 50%, 100% 100%)", box: "right-0 top-0 h-full w-[3200%]" },
  { clip: "polygon(0 0, 100% 0, 50% 50%)", box: "left-0 top-0 h-[3200%] w-full" },
  { clip: "polygon(0 100%, 100% 100%, 50% 50%)", box: "bottom-0 left-0 h-[3200%] w-full" },
] as const

export default function ProductMediaBackdrop({ src }: { src: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {WEDGES.map((wedge) => (
        <span key={wedge.clip} className="absolute inset-0 overflow-hidden" style={{ clipPath: wedge.clip }}>
          <span className={`absolute ${wedge.box}`}>
            <Image
              src={src}
              alt=""
              fill
              quality={30}
              sizes="64px"
              draggable={false}
              data-product-media-backdrop=""
              className="object-fill"
            />
          </span>
        </span>
      ))}
    </span>
  )
}
