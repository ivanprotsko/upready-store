import { Avatar, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { useMe, useUser } from "../../../hooks/api/users"
import { useCustomer } from "../../../hooks/api/customers"

type UserLinkProps = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email: string
  type?: "customer" | "user"
}

export const UserLink = ({
  id,
  first_name,
  last_name,
  email,
  type = "user",
}: UserLinkProps) => {
  const name = [first_name, last_name].filter(Boolean).join(" ")
  const fallback = name ? name.slice(0, 1) : email.slice(0, 1)
  const link = type === "user" ? `/settings/users/${id}` : `/customers/${id}`

  return (
    <Link
      to={link}
      className="transition-fg hover:text-ui-fg-subtle focus-visible:shadow-borders-focus flex w-fit items-center gap-x-2 rounded-md outline-none"
    >
      <Avatar size="2xsmall" fallback={fallback.toUpperCase()} />
      <Text size="small" leading="compact" weight="regular">
        {name || email}
      </Text>
    </Link>
  )
}

/**
 * The actor behind an id, or `null` when the panel cannot name one. A hook
 * rather than a component, because the CALLER has to know whether there is an
 * actor at all: a «От» label rendered in front of a component that draws
 * nothing is a broken row, and `<By id={id} />` is truthy whatever it renders.
 */
const useActor = (id?: string | null) => {
  const isUser = !!id && id.startsWith("user_")
  const isCustomer = !!id && id.startsWith("cus_")
  // On this platform the actor who packs and posts an order is the shop owner,
  // and the fulfillment module stores her tenant-admin id in `created_by` /
  // `marked_shipped_by` as a plain string (see the shipments route). Neither
  // `user_` nor `cus_` matches it, so the order's status history used to print
  // the bare word «От» with nobody after it (measured 2026-09-15 on the order
  // card of a live stand).
  const isTenantAdmin = !!id && id.startsWith("tenadm_")

  // Hooks must run unconditionally (Rules of Hooks); the `enabled` flags
  // already prevent fetching for the branch that does not apply.
  const { user } = useUser(id ?? "", undefined, { enabled: isUser }) // todo: extend to support customers
  const { customer } = useCustomer(id ?? "", undefined, { enabled: isCustomer })
  // The panel can name exactly one tenant admin — the signed-in one. A second
  // admin of the same shop has no endpoint to resolve, and inventing a name
  // for an id is worse than saying nothing.
  const { user: me } = useMe({ enabled: isTenantAdmin })

  if (isTenantAdmin) {
    if (!me || me.id !== id) {
      return null
    }

    const name = [me.first_name, me.last_name].filter(Boolean).join(" ")

    return (
      <div className="flex w-fit items-center gap-x-2">
        <Avatar
          size="2xsmall"
          fallback={(name || me.email).slice(0, 1).toUpperCase()}
        />
        <Text size="small" leading="compact" weight="regular">
          {name || me.email}
        </Text>
      </div>
    )
  }

  const actor = isUser ? user : isCustomer ? customer : null

  if (!actor) {
    return null
  }

  return <UserLink {...actor} />
}

export const By = ({ id }: { id: string }) => useActor(id)

/**
 * «От <кто-то>» as one unit: the label and the actor live or disappear
 * together, so a row never ends on a dangling preposition.
 */
export const ByLine = ({
  id,
  className = "flex items-center gap-x-2 text-sm",
}: {
  id?: string | null
  className?: string
}) => {
  const { t } = useTranslation()
  const actor = useActor(id)

  if (!actor) {
    return null
  }

  return (
    <div className={className}>
      {t("fields.by")} {actor}
    </div>
  )
}
