"use client"

import { clx } from "@medusajs/ui"
import { Play } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import type { VideoMedia } from "./video"

/**
 * The player after the press: the provider's frame, or the template's clip, filling the frame the cover
 * stood in. It takes the focus, so a keyboard user who pressed play can pause it at once.
 */
export function PlayingMedia({ media, title, poster }: { media: VideoMedia; title: string; poster: string | null }) {
  const ref = useRef<HTMLIFrameElement & HTMLVideoElement>(null)
  useEffect(() => ref.current?.focus(), [])

  if (media.kind === "frame") {
    return (
      <iframe
        ref={ref}
        src={media.src}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 size-full border-0"
      />
    )
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- a template's clip carries its words in the section; no caption file yet
    <video
      ref={ref}
      src={media.src}
      poster={poster ?? undefined}
      title={title}
      controls
      autoPlay
      playsInline
      loop={media.loop}
      muted={media.muted}
      className="absolute inset-0 size-full object-cover"
    />
  )
}

/**
 * `video/embed`'s frame (t-2026-10-12-33): the cover as one play button until the visitor presses it,
 * then the player in its place. Nothing of the provider is in the page before the press: no frame, no
 * script, no thumbnail. A template's clip without a cover shows its own first frame with the browser's
 * controls instead.
 */
export default function VideoPlayer({
  media,
  cover,
  title,
  playLabel,
  frameClass,
  sizes,
}: {
  media: VideoMedia
  cover: { url: string; alt: string } | null
  title: string
  playLabel: string
  frameClass: string
  sizes: string
}) {
  const [playing, setPlaying] = useState(false)

  if (!cover && media.kind === "file") {
    return (
      <div data-role="video-player" className={frameClass}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a template's clip carries its words in the section; no caption file yet */}
        <video
          src={media.src}
          title={title}
          controls
          playsInline
          preload="metadata"
          loop={media.loop}
          muted={media.muted}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    )
  }

  if (playing) {
    return (
      <div data-role="video-player" className={frameClass}>
        <PlayingMedia media={media} title={title} poster={cover?.url ?? null} />
      </div>
    )
  }

  return (
    <button
      type="button"
      data-role="video-player"
      aria-label={playLabel}
      onClick={() => setPlaying(true)}
      className={clx(
        frameClass,
        "group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      )}
    >
      {cover ? <Image src={cover.url} alt={cover.alt} fill sizes={sizes} className="object-cover" /> : null}
      {/* The mark wears the template's button. An outlined button is drawn on the page, so the page's own
          colour lies under it here: on a picture its clear fill would leave the mark unseen. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--background)] transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none"
      >
        <span className="flex size-full items-center justify-center rounded-full border border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]">
          <Play className="size-7 translate-x-0.5 fill-current" strokeWidth={1.5} />
        </span>
      </span>
    </button>
  )
}
