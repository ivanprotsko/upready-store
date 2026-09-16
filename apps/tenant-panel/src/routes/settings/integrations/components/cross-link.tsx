import { Text } from "@medusajs/ui"
import { Link } from "react-router-dom"

/**
 * One line pointing at the OTHER half of a split screen
 * (p01-settings-integrations-restructure).
 *
 * Ivan's order of 2026-09-16 20:22 WITA splits every service in two: the
 * requisites under «Подключение» and the behaviour on the screen that owns it.
 * A split with no link is a screen the owner cannot get out of, so every half
 * carries this line. It is a plain `Link`, never an anchor: the same order bans
 * `#` navigation in this panel, and a `to` with a hash would smuggle it back in
 * through a component instead of the sidebar.
 */
export const CrossLink = ({
  to,
  hint,
  label,
  testId,
}: {
  to: string
  /** What the other screen holds, in the owner's words. */
  hint: string
  label: string
  testId?: string
}) => (
  <Text className="text-ui-fg-subtle" size="small" data-testid={testId}>
    {hint}{" "}
    <Link className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover" to={to}>
      {label}
    </Link>
  </Text>
)
