import { useEffect, useRef } from "react"
import { videoCaption } from "~/lib/course-view"
import type { LessonVideo } from "~/lib/types"
import { browserStorage, resumeAt, resumeKey, SAVE_EVERY_SEC } from "~/lib/video-resume"

/**
 * One player that opens where the buyer stopped it: the position goes to
 * localStorage while it plays (`lib/video-resume.ts`) and is read back once
 * the browser knows the video's length. The server renders the plain
 * `<video>`; the resume starts on the client.
 */
function Player({ video, lessonId, index }: { video: LessonVideo; lessonId: string; index: number }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = ref.current
    const storage = browserStorage()

    if (!element || !storage) {
      return
    }

    const key = resumeKey(lessonId, index)
    let lastSaved = 0

    const restore = () => {
      const at = resumeAt(storage.getItem(key), element.duration)

      if (at !== null) {
        element.currentTime = at
      }
    }
    const save = (force: boolean) => {
      const now = element.currentTime

      if (force || Math.abs(now - lastSaved) >= SAVE_EVERY_SEC) {
        lastSaved = now
        storage.setItem(key, String(Math.floor(now)))
      }
    }
    const onTime = () => save(false)
    const onPause = () => save(true)
    const onEnded = () => storage.removeItem(key)

    // The metadata may have arrived before hydration.
    if (element.readyState >= 1) {
      restore()
    } else {
      element.addEventListener("loadedmetadata", restore, { once: true })
    }
    element.addEventListener("timeupdate", onTime)
    element.addEventListener("pause", onPause)
    element.addEventListener("ended", onEnded)

    return () => {
      element.removeEventListener("loadedmetadata", restore)
      element.removeEventListener("timeupdate", onTime)
      element.removeEventListener("pause", onPause)
      element.removeEventListener("ended", onEnded)
    }
  }, [lessonId, index])

  return (
    // No caption track: the shop's lessons carry none yet, the same as in the shop's account.
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      src={video.url}
      poster={video.poster_url ?? undefined}
      className="aspect-video w-full rounded-theme bg-foreground"
      data-testid="lesson-video"
    />
  )
}

/** The lesson's videos in order, each under its own line: its title, or «Видео 2 из 3», and its length. */
export function LessonVideos({ videos, lessonId }: { videos: LessonVideo[]; lessonId: string }) {
  if (videos.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-6" data-testid="lesson-videos">
      {videos.map((video, index) => {
        const caption = videoCaption(video, index, videos.length)

        return (
          <figure key={`${video.url}-${index}`} className="flex flex-col gap-y-2">
            {caption && (
              <figcaption className="text-sm font-medium text-muted-foreground" data-testid="lesson-video-caption">
                {caption}
              </figcaption>
            )}
            <Player video={video} lessonId={lessonId} index={index} />
          </figure>
        )
      })}
    </div>
  )
}
