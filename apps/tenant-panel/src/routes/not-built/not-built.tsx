import { Container, Heading, Text } from "@medusajs/ui"

// tenant-panel: placeholder screen for every route this piece stubs out
// (/products/:id, /orders/:id, /orders/export, and the product/order list and
// create screens until pieces 3/4 overwrite their directories). Not an
// upstream Admin file; the Admin has nothing that plays this role.
export const NotBuilt = () => {
  return (
    <Container className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-y-1 text-center">
        <Heading level="h2">Not built yet</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          This screen is not part of the tenant panel's first wave.
        </Text>
      </div>
    </Container>
  )
}
