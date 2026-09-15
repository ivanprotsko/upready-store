// Negative control for face B, part two: a build-time source is imported and
// used, and no threshold stands over the owner's own data — the hero falls
// back only when the shop has saved no hero at all, which is an emptiness
// check rather than a quantity one.
import { hero as profileHero } from "@lib/profile"

export default function ProfileHero({ tenant }: { tenant: Tenant }) {
  const own = tenant.metadata?.hero_title
  if (own) {
    return <Hero title={own} />
  }
  return <Hero title={profileHero.title} />
}
