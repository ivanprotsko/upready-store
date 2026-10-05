import { createContext } from "react"

type CommandMenuContextValue = {
  open: boolean
  onOpenChange: (open: boolean) => void
  toggleCommandMenu: () => void
}

export const CommandMenuContext = createContext<CommandMenuContextValue | null>(null)
