"use client"

import { useErrorMessage } from "@lib/util/use-error-message"

const ErrorMessage = ({
  error,
  "data-testid": dataTestid,
}: {
  error?: string | null
  "data-testid"?: string
}) => {
  const getErrorMessage = useErrorMessage()

  if (!error) {
    return null
  }

  return (
    <div
      role="alert"
      className="pt-2 text-ui-fg-error text-small-regular"
      data-testid={dataTestid}
    >
      <span>{getErrorMessage(error)}</span>
    </div>
  )
}

export default ErrorMessage
