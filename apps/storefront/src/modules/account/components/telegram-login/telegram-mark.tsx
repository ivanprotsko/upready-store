/**
 * The Telegram mark on the sign-in control, in Telegram's own blue. Like
 * `yandex-login/yandex-mark.tsx`, it is the one hex value on this button and
 * lives in its own file, so swapping in the official asset touches nothing else.
 */
const TelegramMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
    <circle cx="12" cy="12" r="12" fill="#229ED9" />
    <path
      fill="#FFFFFF"
      d="M5.43 11.87l11.57-4.46c.54-.2 1 .13.83.94l-1.97 9.28c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.4c-.16.16-.3.29-.6.29l.21-3.05 5.56-5.02c.24-.21-.05-.33-.38-.12l-6.87 4.33-2.96-.92c-.64-.2-.66-.64.15-.97z"
    />
  </svg>
)

export default TelegramMark
