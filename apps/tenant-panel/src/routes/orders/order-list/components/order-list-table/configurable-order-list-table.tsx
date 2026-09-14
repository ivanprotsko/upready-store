// tenant-panel: stub replacing the Admin's
// components/order-list-table/configurable-order-list-table.tsx, kept for
// import parity with order-list.tsx's `isViewConfigEnabled ? <ConfigurableOrderListTable /> : <OrderListTable />`
// branch. The real component pulls in the Admin's view-configuration
// subsystem: a second DataTable implementation (components/data-table, ~30
// files), hooks/api/views, hooks/use-view-configurations,
// hooks/use-table-configuration, providers/customizer-host-provider and
// lib/permissions/providers/permissions-provider for the save/share-view
// dialog's RBAC checks. Piece 1 already excluded permissions,
// customizer-host-provider and views as out of scope (see
// apps/tenant-panel/README.md, "Not copied at all"), and the panel's feature
// flags are permanently `false` with no server fetch that could ever flip
// `view_configurations` on (providers/feature-flag-provider), so this branch
// is unreachable. Copying ~100 files of dead machinery to render an
// unreachable branch would be scope creep past this piece's brief (orders
// list only); this stub keeps the export and the render path's shape without
// pulling that subsystem in.
export const ConfigurableOrderListTable = () => null
