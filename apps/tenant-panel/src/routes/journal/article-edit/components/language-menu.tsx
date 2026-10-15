import { CheckMini, TriangleDownMini } from "@medusajs/icons"
import { Button, DropdownMenu } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { localeLabel } from "../../article-locales"

/**
 * The language of the text being edited, in the editor's header
 * (t-2026-10-14-01, panel redesign G4, prototype state `journal-edit`: «Русский
 * ▾»). The article's own languages switch the text; a language it has no text
 * in yet is offered as «Добавить текст: …», which creates that text with the
 * same address. Before, this was a row of buttons over the form.
 */

type LanguageMenuProps = {
  current: string
  /** The languages the article has a text in. */
  locales: string[]
  /** The languages offered to add. */
  missing: string[]
  isAdding: boolean
  onSwitch: (locale: string) => void
  onAdd: (locale: string) => void
}

export const LanguageMenu = ({ current, locales, missing, isAdding, onSwitch, onAdd }: LanguageMenuProps) => {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <Button size="small" variant="secondary" type="button" isLoading={isAdding} data-testid="article-language">
          {localeLabel(current)}
          <TriangleDownMini className="text-ui-fg-muted" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {locales.map((locale) => (
          <DropdownMenu.Item key={locale} onClick={() => onSwitch(locale)} className="gap-x-2">
            <span className="flex-1">{localeLabel(locale)}</span>
            {locale === current ? <CheckMini className="text-ui-fg-subtle" /> : null}
          </DropdownMenu.Item>
        ))}
        {missing.length > 0 ? <DropdownMenu.Separator /> : null}
        {missing.map((locale) => (
          <DropdownMenu.Item key={locale} onClick={() => onAdd(locale)}>
            {t("journal.editor.addLanguage", { locale: localeLabel(locale) })}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
