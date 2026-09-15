// Variant of the f17 class: nothing declares `bull` anywhere in this app's
// package.json. It resolves in the monorepo because another workspace package
// pulled it in and pnpm hoisted it; the single-app runtime image installs from
// this package.json alone and has never heard of it.
import Bull from "bull";

export default async function orderPlaced() {
  new Bull("emails").add({});
}
