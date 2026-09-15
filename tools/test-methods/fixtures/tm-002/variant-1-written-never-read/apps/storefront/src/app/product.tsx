// The storefront draws the product and never looks at metadata.badge_text.
export default function ProductPage({ product }: { product: Product }) {
  return <h1>{product.title}</h1>
}
