"use client"

import {useState} from "react"

/**
 * Share strip under an article (b18-blog-full).
 *
 * `navigator.share` where the browser has it (every phone), a copy-to-clipboard
 * fallback everywhere else, and Telegram / WhatsApp / VK as plain links —
 * those three are where this shop's readers actually send things.
 *
 * The confirmation is rendered, not alerted: a swallowed failure has to surface
 * where someone is waiting (rule 20a), and a clipboard write CAN fail (an
 * insecure origin, a denied permission), in which case the label says so
 * instead of quietly claiming success.
 */

type Props = {
  url: string
  title: string
  labels: {share: string; copyLink: string; linkCopied: string}
}

const ArticleShare = ({url, title, labels}: Props) => {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle")

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const targets = [
    {name: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`},
    {name: "WhatsApp", href: `https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`},
    {name: "VK", href: `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`},
  ]

  const handleCopy = async () => {
    try {
      if (navigator.share) {
        await navigator.share({title, url})
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied("done")
    } catch (error) {
      // An aborted native share is the visitor changing their mind, not a
      // failure: only a clipboard that refused is worth saying out loud.
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      setCopied("failed")
      console.error("ArticleShare: could not copy the link", error)
    }
  }

  return (
    <div
      className="border-ui-border-base flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-6"
      data-testid="journal-article-share"
    >
      <span className="txt-compact-small text-ui-fg-muted">{labels.share}:</span>
      {targets.map((target) => (
        <a
          key={target.name}
          href={target.href}
          target="_blank"
          rel="noreferrer"
          className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
        >
          {target.name}
        </a>
      ))}
      <button
        type="button"
        onClick={handleCopy}
        className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline"
        data-testid="journal-article-copy-link"
      >
        {copied === "done"
          ? labels.linkCopied
          : copied === "failed"
            ? url
            : labels.copyLink}
      </button>
    </div>
  )
}

export default ArticleShare
