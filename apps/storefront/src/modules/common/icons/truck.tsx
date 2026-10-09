import type React from "react"

import type { IconProps } from "types/icon"

/**
 * The «Способ доставки» heading's icon (t-2026-10-09-56, Ivan's item 11), drawn to
 * sit next to `MapPin` and `User` on the other two headings: outline, round caps,
 * the same stroke once scaled (1.8 on a 24 box is their 1.5 on a 20 box).
 */
const Truck: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M14 17.5V6.5C14 5.67157 13.3284 5 12.5 5H4C3.17157 5 2.5 5.67157 2.5 6.5V16.5C2.5 17.0523 2.94772 17.5 3.5 17.5H5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 17.5H9"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 17.5H20.5C21.0523 17.5 21.5 17.0523 21.5 16.5V13.1C21.5 12.8728 21.4227 12.6524 21.2808 12.475L18.3 8.75C18.1103 8.51288 17.8231 8.375 17.5194 8.375H14"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 19.5C18.1046 19.5 19 18.6046 19 17.5C19 16.3954 18.1046 15.5 17 15.5C15.8954 15.5 15 16.3954 15 17.5C15 18.6046 15.8954 19.5 17 19.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 19.5C8.10457 19.5 9 18.6046 9 17.5C9 16.3954 8.10457 15.5 7 15.5C5.89543 15.5 5 16.3954 5 17.5C5 18.6046 5.89543 19.5 7 19.5Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Truck
