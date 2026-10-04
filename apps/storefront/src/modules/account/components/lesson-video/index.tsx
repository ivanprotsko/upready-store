"use client"

import { useEffect, useRef } from "react"
import { isVideoWatched, type PlayedRange } from "@lib/util/lesson-flow"
import { useLessonCredit } from "@modules/account/components/lesson-credit"

const playedRanges = (video: HTMLVideoElement): PlayedRange[] =>
  Array.from(
    { length: video.played.length },
    (_, index) => [video.played.start(index), video.played.end(index)] as const
  )

/**
 * The lesson's video (ask-20261005-061005-2e78). When it ends, the lesson
 * counts if the video was watched rather than skipped to the end
 * (`isVideoWatched`: 90 % of its length actually played). A video that cannot
 * be played at all hands the lesson over to its text, so a broken file never
 * leaves «Дальше» off for good.
 */
export default function LessonVideo({ src }: { src: string }) {
  const { credit, videoFailed } = useLessonCredit()
  const ref = useRef<HTMLVideoElement>(null)

  // An error raised before hydration fires no `onError`; the element keeps it in `error`.
  useEffect(() => {
    if (ref.current?.error) {
      videoFailed()
    }
  }, [videoFailed])

  const onEnded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (
      isVideoWatched({
        ended: video.ended,
        played: playedRanges(video),
        duration: video.duration,
      })
    ) {
      credit()
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- no seeded lesson carries a caption track yet
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      src={src}
      onEnded={onEnded}
      onError={videoFailed}
      className="w-full rounded-large"
      data-testid="lesson-video"
    />
  )
}
