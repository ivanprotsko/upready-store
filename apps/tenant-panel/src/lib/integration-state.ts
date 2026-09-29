/**
 * The state of one connection on «Подключение» and on a service's own page
 * (p01-settings-integrations-restructure, 46df D1).
 *
 * Four states, never three: while the query is in flight nothing is claimed
 * (rule 19h); a stored credential the server cannot decrypt is its own state,
 * because «не подключено» over a row that exists sends the owner looking for a
 * bug, and «подключено» over a row nothing can use is a lie the buyer finds
 * first. `unreadable` wins over `stored` for that reason.
 */
export type IntegrationTone = "pending" | "unreadable" | "connected" | "missing"

export const integrationTone = (state: {
  pending: boolean
  stored: boolean
  unreadable: boolean
}): IntegrationTone => {
  if (state.pending) {
    return "pending"
  }
  if (state.unreadable) {
    return "unreadable"
  }
  return state.stored ? "connected" : "missing"
}
