/**
 * Иконки панели редактирования: монохром, stroke 1.5, currentColor, 16px —
 * канон Geist (~/upready/packages/geist-kit/AGENTS.md, «Hard rules»).
 * Контуры взяты из набора lucide, на который канон и ссылается.
 */

type IconProps = { size?: number };

function Svg({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** lucide `eye` — «блок на странице». */
export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/** lucide `eye-off` — «блок выключен». */
export function EyeOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.64 0 8.58 2.79 9.94 6.65a1 1 0 0 1 0 .7 11.3 11.3 0 0 1-2.17 3.5" />
      <path d="M6.61 6.61A11.42 11.42 0 0 0 2.06 11.65a1 1 0 0 0 0 .7C3.42 16.21 7.36 19 12 19a10.4 10.4 0 0 0 5.39-1.39" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </Svg>
  );
}

/** lucide `chevron-up` — «поднять выше». */
export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m18 15-6-6-6 6" />
    </Svg>
  );
}

/** lucide `chevron-down` — «опустить ниже». */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

/** lucide `pencil` — вход в режим редактирования. */
export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21.17 6.83a2.83 2.83 0 0 0-4-4L3.5 16.5 2 22l5.5-1.5Z" />
      <path d="m15 5 4 4" />
    </Svg>
  );
}

/** lucide `check` — выход из режима. */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
