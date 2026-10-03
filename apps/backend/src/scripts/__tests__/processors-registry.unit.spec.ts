import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

/**
 * Gate for `docs/instances/processors.json` (t-2026-10-03-23): every
 * payment-* or auth-* module under `apps/backend/src/modules/`, plus the
 * few integrations named in EXTRA_INTEGRATION_MODULES below that carry no
 * such prefix, has to appear in some registry entry's `integrationModules`
 * array. A new integration with no entry fails this suite, which is already
 * part of `pnpm run test:unit` and therefore of `pr-checks.yml`'s Backend
 * job — no new CI job was needed for this gate.
 *
 * `EXTRA_INTEGRATION_MODULES` exists because not every integration module
 * directory is named `payment-*` or `auth-*` (`smtp-notification`,
 * `cdek-fulfillment`, `pochta-fulfillment`, `wb`, `wb-write`, `ozon`): a
 * module in that situation needs ITS NAME added here as well as an entry in
 * processors.json — two steps, both deliberate, so this list is the second
 * place (after the registry itself) a reviewer sees it change.
 */
const EXTRA_INTEGRATION_MODULES = [
  "smtp-notification",
  "cdek-fulfillment",
  "pochta-fulfillment",
  "wb",
  "wb-write",
  "ozon",
];

const isPrefixedIntegration = (name: string): boolean =>
  name.startsWith("payment-") || name.startsWith("auth-");

/** Module directory names that must carry a processors.json entry. */
export const requiredIntegrationModules = (moduleDirNames: string[]): string[] =>
  moduleDirNames.filter(
    (name) => isPrefixedIntegration(name) || EXTRA_INTEGRATION_MODULES.includes(name),
  );

type ProcessorsRegistry = { processors: { service: string; integrationModules: string[] }[] };

/** Every module name any registry entry names, across every processor. */
export const registeredModuleNames = (registry: ProcessorsRegistry): Set<string> =>
  new Set(registry.processors.flatMap((processor) => processor.integrationModules));

/** Integration module directories with no registry entry naming them. */
export const findUnregisteredModules = (
  moduleDirNames: string[],
  registry: ProcessorsRegistry,
): string[] => {
  const registered = registeredModuleNames(registry);
  return requiredIntegrationModules(moduleDirNames).filter((name) => !registered.has(name));
};

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "../..");
const MODULES_DIR = path.join(BACKEND_ROOT, "src", "modules");
const REGISTRY_PATH = path.join(REPO_ROOT, "docs", "instances", "processors.json");

const listModuleDirNames = (modulesDir: string): string[] =>
  readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "__tests__")
    .map((entry) => entry.name);

const readRegistry = (file: string): ProcessorsRegistry => JSON.parse(readFileSync(file, "utf8"));

describe("every payment-* / auth-* / known integration module is in the processor registry", () => {
  it("reads the real module tree, so a clean result means something", () => {
    const moduleDirNames = listModuleDirNames(MODULES_DIR);
    expect(moduleDirNames.length).toBeGreaterThan(5);
    expect(moduleDirNames).toContain("payment-robokassa");
    expect(moduleDirNames).toContain("auth-telegram");
  });

  it("finds no integration module missing from docs/instances/processors.json", () => {
    const moduleDirNames = listModuleDirNames(MODULES_DIR);
    const registry = readRegistry(REGISTRY_PATH);
    const missing = findUnregisteredModules(moduleDirNames, registry);

    expect(
      missing.map(
        (name) =>
          `apps/backend/src/modules/${name} has no entry in docs/instances/processors.json. ` +
          `Add one (service, country, whatItReceives, why, instances, legalBasis, ` +
          `integrationModules: ["${name}"]) before this integration ships.`,
      ),
    ).toEqual([]);
  });

  it("detects a new payment or auth module the moment it appears, even before processors.json exists", () => {
    const root = mkdtempSync(path.join(tmpdir(), "t-2026-10-03-23-registry-gate-"));

    try {
      const modulesDir = path.join(root, "modules");
      for (const name of ["payment-robokassa", "auth-yandex", "payment-newthing", "wishlist", "course"]) {
        mkdirSync(path.join(modulesDir, name), { recursive: true });
      }

      const emptyRegistry: ProcessorsRegistry = { processors: [] };
      const missingAgainstEmpty = findUnregisteredModules(listModuleDirNames(modulesDir), emptyRegistry);
      expect(missingAgainstEmpty.sort()).toEqual(["auth-yandex", "payment-newthing", "payment-robokassa"]);

      const partialRegistry: ProcessorsRegistry = {
        processors: [
          { service: "Robokassa", integrationModules: ["payment-robokassa"] },
          { service: "Yandex ID", integrationModules: ["auth-yandex"] },
        ],
      };
      expect(findUnregisteredModules(listModuleDirNames(modulesDir), partialRegistry)).toEqual([
        "payment-newthing",
      ]);

      // wishlist and course carry no payment-/auth- prefix and are not in
      // EXTRA_INTEGRATION_MODULES: they are internal modules, not a
      // third-party integration, and this gate must stay quiet about them.
      expect(requiredIntegrationModules(listModuleDirNames(modulesDir))).not.toContain("wishlist");
      expect(requiredIntegrationModules(listModuleDirNames(modulesDir))).not.toContain("course");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
