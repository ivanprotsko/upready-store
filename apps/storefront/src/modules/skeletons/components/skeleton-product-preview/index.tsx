import { FRAME_ASPECT } from "@modules/products/components/product-media"

/**
 * The card while it loads: the same frame ratio and the same text slots as `ProductCard`,
 * so the grid does not move when the products arrive.
 */
const SkeletonProductPreview = () => {
  return (
    <div className="flex animate-pulse flex-col motion-reduce:animate-none">
      <div
        className="w-full rounded-[var(--radius,8px)] bg-ui-bg-subtle"
        style={{ aspectRatio: FRAME_ASPECT.card }}
      />
      <div className="mt-3 h-10">
        <div className="h-4 w-4/5 rounded bg-ui-bg-component" />
      </div>
      <div className="mt-1 h-5" />
      <div className="pt-2">
        <div className="h-6 w-2/5 rounded bg-ui-bg-component" />
      </div>
    </div>
  )
}

export default SkeletonProductPreview
