import {
  Award,
  BadgeCheck,
  Banknote,
  Clock,
  CreditCard,
  Flame,
  Gift,
  Heart,
  Leaf,
  type LucideIcon,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Percent,
  Phone,
  QrCode,
  RotateCcw,
  Ruler,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
  Wallet,
} from "lucide-react"

import type { BlockIconName } from "./icon-name"

const ICONS: Record<BlockIconName, LucideIcon> = {
  truck: Truck,
  package: Package,
  "map-pin": MapPin,
  store: Store,
  clock: Clock,
  "credit-card": CreditCard,
  wallet: Wallet,
  "qr-code": QrCode,
  banknote: Banknote,
  "shield-check": ShieldCheck,
  "badge-check": BadgeCheck,
  "rotate-ccw": RotateCcw,
  award: Award,
  star: Star,
  heart: Heart,
  leaf: Leaf,
  gift: Gift,
  percent: Percent,
  phone: Phone,
  "message-circle": MessageCircle,
  mail: Mail,
  send: Send,
  tag: Tag,
  "shopping-bag": ShoppingBag,
  ruler: Ruler,
  sparkles: Sparkles,
  flame: Flame,
}

/**
 * An icon a template names by string (`./icon-name.ts`), drawn with lucide-react, the only icon set
 * a block may use (BLOCK-CONTRACT.md §3). Decorative: the text beside it carries the meaning, so it
 * is hidden from screen readers. Size and colour come from the caller's classes (`size-5`,
 * `text-ui-fg-subtle`); the stroke follows `currentColor`.
 */
export default function BlockIcon({ name, className }: { name: BlockIconName; className?: string }) {
  const Icon = ICONS[name]
  return <Icon aria-hidden="true" focusable="false" strokeWidth={1.75} className={className} />
}
