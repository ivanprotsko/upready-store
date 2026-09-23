import type React from "react"

import type { IconProps } from "types/icon"

/** A wallet: the mark beside the price in the product page's buy box. */
const Wallet: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M3.5 6.75V5.5A1.75 1.75 0 0 1 5.25 3.75h9"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="2.75"
        y="6"
        width="14.5"
        height="10.25"
        rx="2.25"
        stroke={color}
        strokeWidth="1.5"
      />
      <path
        d="M12.5 11.125h4.75"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12.75" cy="11.125" r="1" fill={color} />
    </svg>
  )
}

export default Wallet
