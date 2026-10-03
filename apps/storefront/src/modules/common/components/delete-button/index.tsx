import { deleteLineItem } from "@lib/data/cart"
import { Spinner, Trash } from "@medusajs/icons"
import { useCartUpdate } from "@modules/checkout/context/cart-update-context"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import { useState } from "react"

const DeleteButton = ({
  id,
  onDelete,
  children,
  className,
  "data-testid": dataTestId,
}: {
  id: string
  /**
   * Removes the line some other way. The cart page passes the client cart queue's
   * removal (t-2026-10-03-66), which takes the line away at once; without it the
   * button deletes through the Server Action and spins until it answers.
   */
  onDelete?: () => void
  children?: React.ReactNode
  className?: string
  "data-testid"?: string
}) => {
  const t = useTranslations("Common")
  const [isDeleting, setIsDeleting] = useState(false)
  const { trackCartUpdate } = useCartUpdate()

  const handleDelete = async (id: string) => {
    if (onDelete) {
      onDelete()
      return
    }
    setIsDeleting(true)
    await trackCartUpdate(() => deleteLineItem(id)).catch((_err) => {
      setIsDeleting(false)
    })
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        aria-label={t("remove")}
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer"
        onClick={() => handleDelete(id)}
        data-testid={dataTestId}
      >
        {isDeleting ? <Spinner className="animate-spin" /> : <Trash />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default DeleteButton
