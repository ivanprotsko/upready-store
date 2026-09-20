/**
 * Negative control: a seed script the product itself runs. The entrypoint
 * calls it on every boot, it belongs in the compiled tree, and its name
 * carries no fixture marker.
 */
export default async function seedTenants() {
  return { created: 0 };
}
