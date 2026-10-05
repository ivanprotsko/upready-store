import { useContext } from "react"
import { CommandMenuContext } from "./command-menu-context"

export const useCommandMenu = () => {
  const context = useContext(CommandMenuContext)
  if (!context) {
    throw new Error("useCommandMenu must be used within a CommandMenuProvider")
  }
  return context
}
