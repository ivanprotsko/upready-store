# Acceptance Fixtures and One-Off Seed Scripts

Everything here is throwaway: data a single acceptance round needed on a
scratch database, and nothing a shop ever runs. None of it is wired into a
package script, and none of it belongs on a real database.

Run one against a scratch database:

```bash
cd apps/backend
npx medusa exec ./scripts/fixtures/<file>.ts
```

Type-check the whole directory, from the repository root:

```bash
pnpm check:backend-fixtures
```

## Why the Directory Exists

`medusa build` does not compile the Medusa primitives alone. It builds its
TypeScript program from every file `tsconfig.json` includes and drops only the
path segments `integration-tests`, `test`, `unit-tests` and `src/admin`
(`@medusajs/framework` 2.19.0, `dist/build-tools/compiler.js` in
`#emitBuildOutput`, and `isFileIgnored` in `dist/build-tools/compiler-utils.js`).
A fixture under `src/` is therefore type-checked and emitted as part of the
production image, and one type error in it fails that image build.

That is what happened on `ba126e8`: `src/scripts/f12-seed-test-order.ts:55`
raised TS2322 and the mt-backend image stopped building, with the live host
left on the previous commit.

`apps/backend/tsconfig.json` excludes `scripts/fixtures`, so a type error here
costs a fixture run and not an image. `ts-node` still transpiles these files
when `medusa exec` requires them, because it ignores `include` and `exclude`
and compiles whatever is required outside `node_modules`. The `tsconfig.json`
next to this README is what type-checks them on demand.

`src/scripts/__tests__/fixtures-outside-src.unit.spec.ts` is the gate that
fails when a fixture reappears under `src/`.
