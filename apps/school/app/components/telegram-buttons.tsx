/**
 * The course's Telegram channel and the stream's chat. Every course of the
 * school talks there, the kidneys course runs there entirely, so the pair
 * stands where a buyer looks first: under the course's title.
 */

const BASE = "inline-flex min-h-11 items-center justify-center rounded-theme px-5 text-center font-medium"

export const CHANNEL_CLASS = `${BASE} border border-primary bg-primary-tint text-primary hover:bg-accent`
export const CHAT_CLASS = `${BASE} border border-border hover:bg-muted`

export function TelegramButtons({
  channelUrl,
  chatUrl,
}: {
  channelUrl: string | null | undefined
  chatUrl: string | null | undefined
}) {
  if (!channelUrl && !chatUrl) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-testid="course-telegram">
      {channelUrl && (
        <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={CHANNEL_CLASS} data-testid="telegram-channel">
          Вступить в Telegram-канал
        </a>
      )}
      {chatUrl && (
        <a href={chatUrl} target="_blank" rel="noopener noreferrer" className={CHAT_CLASS} data-testid="telegram-chat">
          Чат потока
        </a>
      )}
    </div>
  )
}

/** A closed lock, for a lesson whose day has not come. */
export function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
