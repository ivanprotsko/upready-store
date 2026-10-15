import type { ReactNode } from "react"
import { ProgressStatus, ProgressTabs } from "@medusajs/ui"

import { RouteFocusModal } from "../../../components/modals"

/**
 * The header of the page and article editors (t-2026-10-14-01, panel
 * redesign G4, prototype states `pages-edit*` and `journal-edit*`): the tabs
 * next to the close button, the way «Добавить товар» draws its own, then the
 * name of what is edited, then on the right what the caller adds (the language,
 * the status). One pair «Отмена / Сохранить» in the footer serves every tab.
 *
 * Render it inside `<ProgressTabs value onValueChange>`; the tab bodies are
 * `ProgressTabs.Content` in the modal's body.
 */

/** Tabs before the open one read as done, the open one as in progress, the rest as not started. */
export const tabStatus = <T extends string>(tabs: readonly T[], open: T, tab: T): ProgressStatus => {
  const at = tabs.indexOf(tab)
  const current = tabs.indexOf(open)
  return at < current ? "completed" : at === current ? "in-progress" : "not-started"
}

type EditorTabsProps<T extends string> = {
  tabs: ReadonlyArray<{ value: T; label: string }>
  open: T
  /** What is edited: the page's or the article's title. */
  title: string
  aside?: ReactNode
}

export const EditorTabs = <T extends string>({ tabs, open, title, aside }: EditorTabsProps<T>) => (
  <RouteFocusModal.Header>
    <div className="-my-2 flex w-full min-w-0 items-center border-l">
      {/* On a phone three tabs and the language are wider than the header:
          the tabs scroll sideways in their own row, the name goes to sr-only. */}
      <ProgressTabs.List className="flex shrink-0 items-center max-md:min-w-0 max-md:shrink max-md:overflow-x-auto">
        {tabs.map((tab) => (
          <ProgressTabs.Trigger
            key={tab.value}
            value={tab.value}
            status={tabStatus(
              tabs.map((one) => one.value),
              open,
              tab.value
            )}
            className="w-auto max-w-none flex-none whitespace-nowrap"
            data-testid={`editor-tab-${tab.value}`}
          >
            {tab.label}
          </ProgressTabs.Trigger>
        ))}
      </ProgressTabs.List>
      <RouteFocusModal.Title asChild>
        <span className="txt-compact-small text-ui-fg-subtle min-w-0 flex-1 truncate px-4 max-md:sr-only">
          {title}
        </span>
      </RouteFocusModal.Title>
      {aside ? <div className="flex shrink-0 items-center gap-x-2 pl-2">{aside}</div> : null}
    </div>
  </RouteFocusModal.Header>
)
