import { MagnifyingGlass } from "@medusajs/icons"
import { IconButton, Text, clx } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { commandMenuShortcutLabel } from "../../lib/command-menu"
import { useCommandMenu } from "../../providers/command-menu-provider/use-command-menu"

// tenant-panel (ask-20261005-112844-10ba): the Admin's sidebar `Searchbar`
// (components/layout/main-layout/main-layout.tsx, @medusajs/dashboard 2.19.0),
// with the shortcut printed for the owner's keyboard instead of a fixed «⌘K».
export const CommandMenuTrigger = () => {
  const { t } = useTranslation()
  const { toggleCommandMenu } = useCommandMenu()

  return (
    <div>
      <button
        type="button"
        onClick={toggleCommandMenu}
        data-testid="command-menu-trigger"
        className={clx(
          "bg-ui-bg-subtle text-ui-fg-subtle flex w-full items-center gap-x-2.5 rounded-md px-2 py-1 outline-none max-lg:min-h-11",
          "hover:bg-ui-bg-subtle-hover",
          "focus-visible:shadow-borders-focus"
        )}
      >
        <MagnifyingGlass />
        <div className="flex-1 text-start">
          <Text size="small" leading="compact" weight="plus">
            {t("app.search.label")}
          </Text>
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-muted max-lg:hidden">
          {commandMenuShortcutLabel(navigator.userAgent)}
        </Text>
      </button>
    </div>
  )
}

/**
 * The same menu from the top bar on a phone, where the sidebar is a drawer
 * behind a button and there is no keyboard shortcut to press.
 */
export const CommandMenuTopbarButton = () => {
  const { t } = useTranslation()
  const { toggleCommandMenu } = useCommandMenu()

  return (
    <IconButton
      className="hidden max-lg:flex max-lg:h-11 max-lg:w-11"
      variant="transparent"
      size="small"
      onClick={toggleCommandMenu}
      aria-label={t("app.search.label")}
      data-testid="command-menu-topbar-trigger"
    >
      <MagnifyingGlass className="text-ui-fg-muted" />
    </IconButton>
  )
}
