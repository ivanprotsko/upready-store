import { LINK_CLASS } from "~/components/lesson-body"
import { CHANNEL_CLASS, CHAT_CLASS } from "~/components/telegram-buttons"
import { attachmentText } from "~/lib/course-view"
import type { LessonAttachment, LessonLink } from "~/lib/types"

/**
 * What comes under a lesson's text: its files, worded and styled the way the
 * text's own file links are, and its links, Telegram as buttons, the rest
 * (a YouTube video, a page) as a plain link with its title. No iframe: a
 * third-party player would load its scripts into every lesson page.
 */

export function LessonAttachments({ files }: { files: LessonAttachment[] }) {
  if (files.length === 0) {
    return null
  }

  return (
    <section className="flex max-w-measure flex-col gap-y-3" data-testid="lesson-attachments">
      <h2 className="text-lg font-semibold">Файлы урока</h2>
      <ul className="flex flex-col gap-y-2">
        {files.map((file, index) => (
          <li key={`${file.url}-${index}`}>
            <a href={file.url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS} data-testid="lesson-attachment">
              {attachmentText(file)}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LessonLinks({ links }: { links: LessonLink[] }) {
  const telegram = links.filter((link) => link.kind === "telegram_channel" || link.kind === "telegram_chat")
  const other = links.filter((link) => link.kind !== "telegram_channel" && link.kind !== "telegram_chat")

  if (links.length === 0) {
    return null
  }

  return (
    <section className="flex max-w-measure flex-col gap-y-3" data-testid="lesson-links">
      {telegram.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {telegram.map((link, index) => (
            <a
              key={`${link.url}-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={link.kind === "telegram_channel" ? CHANNEL_CLASS : CHAT_CLASS}
              data-testid="lesson-telegram"
            >
              {link.title}
            </a>
          ))}
        </div>
      )}
      {other.length > 0 && (
        <ul className="flex flex-col gap-y-2">
          {other.map((link, index) => (
            <li key={`${link.url}-${index}`}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS} data-testid="lesson-link-out">
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
