import type React from "react"

import type { IconProps } from "types/icon"

/** The wishlist heart: an outline, or filled solid when the product is saved. */
const Heart: React.FC<IconProps & { filled?: boolean }> = ({
  size = "20",
  color = "currentColor",
  filled = false,
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? color : "none"}
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M10 17.5s-6.25-3.955-8.333-8.145C.52 6.8 1.586 3.75 4.479 2.976c1.89-.506 3.86.3 4.896 1.996a.75.75 0 0 0 1.25 0c1.036-1.696 3.006-2.502 4.896-1.996 2.893.774 3.959 3.824 2.812 6.379C16.25 13.545 10 17.5 10 17.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Heart
