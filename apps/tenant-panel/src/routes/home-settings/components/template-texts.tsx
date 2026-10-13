import { useTranslation } from "react-i18next"
import { Button, Heading, Input, Label, Text, Textarea } from "@medusajs/ui"

import {
  channelPath,
  channelRefusal,
  channelsOf,
  fieldLabelKeys,
  isLongText,
  isSectionOwn,
  lengthRefusal,
  textsOf,
  withChannel,
  withText,
  type ChannelField,
  type SectionDraft,
  type SectionRefusal,
  type SectionText,
} from "../section-texts"
import type { TemplateCard } from "../templates"

// tenant-panel: «Тексты секций» under the chosen template (t-2026-10-12-33 PE2). One group per section that has
// texts (or the signup's channels) and whose block the backend checks; one field per text and language. Names
// come from the panel's i18n by leaf (`homeSettings.templates.texts.fields`), never a path or a block id (rule
// 18e). The logic is `../section-texts.ts`; the state is `template-section.tsx`'s, so the apply sends it.

/** What a channel's address looks like, as the placeholder of its field. */
const CHANNEL_PLACEHOLDER: Record<ChannelField["network"], string> = {
  telegram: "https://t.me/…",
  vk: "https://vk.com/…",
  max: "https://max.ru/…",
}

const fieldId = (index: number, path: string, lang?: string) =>
  `template-text-${index}-${path.replace(/[^a-zA-Z0-9]+/g, "-")}${lang ? `-${lang}` : ""}`

export const TemplateTexts = ({
  card,
  locales,
  draft,
  refusals,
  onChange,
  onReset,
}: {
  card: TemplateCard
  /** The catalogue's languages: what reads as a text. */
  locales: string[]
  draft: SectionDraft
  refusals: SectionRefusal[]
  onChange: (index: number, props: Record<string, unknown>, field: string) => void
  onReset: (index: number) => void
}) => {
  const { t, i18n } = useTranslation()

  /** The language of a field in the panel's own words: «Русский», «Английский». */
  const languageName = (code: string) => {
    try {
      const name = new Intl.DisplayNames([i18n.language || "ru"], { type: "language" }).of(code) ?? code
      return name.charAt(0).toLocaleUpperCase(i18n.language) + name.slice(1)
    } catch {
      return code
    }
  }

  const fieldName = (text: SectionText) => {
    const label = fieldLabelKeys(text)
      .map((key) => t(`homeSettings.templates.texts.${key}`, { defaultValue: "" }))
      .find((value) => value.trim())
    const named = label || t("homeSettings.templates.texts.fields.text", { defaultValue: "Text" })
    return text.numbers.length
      ? t("homeSettings.templates.texts.numbered", {
          defaultValue: "{{label}} {{number}}",
          label: named,
          number: text.numbers.join("."),
        })
      : named
  }

  /**
   * A refusal in the owner's words: the length one as its limit and the length now, a channel off its network as
   * the network's hosts, anything else as it came.
   */
  const refusalText = (refusal: SectionRefusal) => {
    const length = lengthRefusal(refusal.message)
    if (length) {
      return t("homeSettings.templates.texts.tooLong", {
        defaultValue: "At most {{max}} characters, now {{now}}",
        max: length.max,
        now: length.now,
      })
    }
    const hosts = channelRefusal(refusal.message)
    if (hosts) {
      return t("homeSettings.templates.texts.channels.wrongHost", {
        defaultValue: "Needs the address of a channel on {{hosts}}",
        hosts: hosts.join(t("homeSettings.templates.texts.channels.or", { defaultValue: " or " })),
      })
    }
    return refusal.message
  }

  const refusalAt = (index: number, field: string) =>
    refusals.find((refusal) => refusal.index === index && refusal.field === field)

  const groups = card.sections.flatMap((section, index) => {
    const props = draft[index]
    if (!section.editable || props === undefined) return []
    const texts = textsOf(props, locales)
    const channels = channelsOf(section.block, props)
    if (!texts.length && !channels.length) return []
    return [{ section, index, props, texts, channels }]
  })

  /** A refusal of this section that names none of its fields: shown at the top of its group. */
  const looseRefusals = (index: number, texts: SectionText[], channels: ChannelField[]) => {
    const fields = new Set([
      ...texts.flatMap((text) => [text.path, ...Object.keys(text.text).map((lang) => `${text.path}.${lang}`)]),
      ...channels.map((channel) => channelPath(channel.index)),
    ])
    return refusals.filter((refusal) => refusal.index === index && !fields.has(refusal.field))
  }

  return (
    <div className="flex flex-col gap-y-4" data-testid="template-texts">
      <div className="flex flex-col gap-y-1">
        <Heading level="h3">{t("homeSettings.templates.texts.heading", { defaultValue: "Section texts" })}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {groups.length
            ? t("homeSettings.templates.texts.hint", {
                defaultValue:
                  "Only the words change here. The number of reviews, questions and slides, the pictures and the links stay as in the template.",
              })
            : t("homeSettings.templates.texts.none", { defaultValue: "This template has no sections with texts." })}
        </Text>
      </div>

      {groups.map(({ section, index, props, texts, channels }) => (
        <div
          key={`${index}-${section.block}`}
          role="group"
          aria-labelledby={`template-texts-title-${index}`}
          className="flex min-w-0 flex-col gap-y-4 rounded-lg border border-ui-border-base p-4"
          data-testid={`template-texts-section-${index}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text id={`template-texts-title-${index}`} size="small" weight="plus" as="span">
              {t("homeSettings.templates.texts.sectionTitle", {
                defaultValue: "Section {{place}} · {{kind}}",
                place: index + 1,
                kind: t(`homeSettings.templates.categories.${section.category}`, {
                  defaultValue: t("homeSettings.templates.categories.text", { defaultValue: "Text" }),
                }),
              })}
            </Text>
            <Button
              variant="secondary"
              size="small"
              type="button"
              disabled={isSectionOwn(card, index, draft)}
              onClick={() => onReset(index)}
              data-testid={`template-texts-reset-${index}`}
            >
              {t("homeSettings.templates.texts.reset", { defaultValue: "Restore the template's text" })}
            </Button>
          </div>

          {looseRefusals(index, texts, channels).map((refusal) => (
            <Text key={refusal.message} size="small" className="text-ui-fg-error" data-testid="template-text-refusal">
              {refusalText(refusal)}
            </Text>
          ))}

          {texts.map((text) => (
            <div key={text.path} className="flex flex-col gap-y-2">
              <Text size="small" weight="plus" as="span">
                {fieldName(text)}
              </Text>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Object.entries(text.text).map(([lang, words]) => {
                  const id = fieldId(index, text.path, lang)
                  const refusal = refusalAt(index, `${text.path}.${lang}`) ?? refusalAt(index, text.path)
                  const Field = isLongText(text) ? Textarea : Input
                  return (
                    <div key={lang} className="flex min-w-0 flex-col gap-y-1">
                      <Label size="xsmall" htmlFor={id} className="text-ui-fg-subtle">
                        {languageName(lang)}
                      </Label>
                      <Field
                        id={id}
                        value={words}
                        aria-invalid={refusal ? true : undefined}
                        aria-describedby={refusal || !words.trim() ? `${id}-note` : undefined}
                        onChange={(event: { target: { value: string } }) =>
                          onChange(index, withText(props, text.path, lang, event.target.value), `${text.path}.${lang}`)
                        }
                        data-testid={id}
                        {...(isLongText(text) ? { rows: 3 } : {})}
                      />
                      {refusal ? (
                        <Text id={`${id}-note`} size="small" className="text-ui-fg-error" data-testid="template-text-refusal">
                          {refusalText(refusal)}
                        </Text>
                      ) : !words.trim() ? (
                        <Text id={`${id}-note`} size="small" className="text-ui-fg-muted">
                          {t("homeSettings.templates.texts.empty", {
                            defaultValue: "Empty: the storefront shows this text in another language.",
                          })}
                        </Text>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {channels.length ? (
            <div className="flex flex-col gap-y-3">
              <Text size="small" className="text-ui-fg-subtle">
                {t("homeSettings.templates.texts.channels.hint", {
                  defaultValue: "The address of the shop's channel. Empty: the storefront shows no button for it.",
                })}
              </Text>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {channels.map((channel) => {
                  const path = channelPath(channel.index)
                  const id = fieldId(index, path)
                  const refusal = refusalAt(index, path)
                  return (
                    <div key={channel.index} className="flex min-w-0 flex-col gap-y-1">
                      <Label size="small" weight="plus" htmlFor={id}>
                        {t(`homeSettings.templates.texts.channels.${channel.network}`, { defaultValue: channel.network })}
                      </Label>
                      <Input
                        id={id}
                        type="url"
                        inputMode="url"
                        placeholder={CHANNEL_PLACEHOLDER[channel.network]}
                        value={channel.href ?? ""}
                        aria-invalid={refusal ? true : undefined}
                        aria-describedby={refusal ? `${id}-note` : undefined}
                        onChange={(event) => onChange(index, withChannel(props, channel.index, event.target.value), path)}
                        data-testid={id}
                      />
                      {refusal ? (
                        <Text id={`${id}-note`} size="small" className="text-ui-fg-error" data-testid="template-text-refusal">
                          {refusalText(refusal)}
                        </Text>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
