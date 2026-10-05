import { PropsWithChildren, useEffect, useState } from "react"

import { CommandMenu } from "../../components/command-menu"
import { isCommandMenuShortcut } from "../../lib/command-menu"
import { useSidebar } from "../sidebar-provider"
import { CommandMenuContext } from "./command-menu-context"

// tenant-panel (ask-20261005-112844-10ba): the Admin's
// providers/search-provider/search-provider.tsx (@medusajs/dashboard 2.19.0),
// renamed for what it opens here. Two changes: the shortcut is read through
// `isCommandMenuShortcut` (the physical K key, so ⌘K works on the Russian
// layout too), and its default is prevented, so Ctrl+K does not also focus the
// browser's address bar.
export const CommandMenuProvider = ({ children }: PropsWithChildren) => {
  const [open, setOpen] = useState(false)
  const { mobile, toggle } = useSidebar()

  const toggleCommandMenu = () => {
    const update = !open

    /**
     * If the mobile sidebar is open, then make sure
     * to close it when opening the command menu
     */
    if (update && mobile) {
      toggle("mobile")
    }

    setOpen(update)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isCommandMenuShortcut(e)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  return (
    <CommandMenuContext.Provider
      value={{
        open,
        onOpenChange: setOpen,
        toggleCommandMenu,
      }}
    >
      {children}
      <CommandMenu />
    </CommandMenuContext.Provider>
  )
}
