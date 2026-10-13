// Loads the packshot pipeline from its TypeScript source, so the CLI and the
// measure script run exactly the module the backend serves
// (apps/backend/src/packshot). ts-node is already a devDependency of the backend
// and `tsconfig.json` asks it for swc; transpile-only keeps a CLI start at about a
// second. Nothing is built or written.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let registered = false;

export function loadPackshot(moduleName) {
  if (!registered) {
    require('ts-node').register({
      project: path.join(BACKEND_DIR, 'tsconfig.json'),
      transpileOnly: true,
      swc: true,
      compilerOptions: { module: 'commonjs' },
    });
    registered = true;
  }

  return require(path.join(BACKEND_DIR, 'src', 'packshot', moduleName));
}

/**
 * The backend's own env files (`apps/backend/.env`), read the way `medusa develop`
 * reads them, so the CLI sees the same FAL_KEY as the server. Values are never
 * printed.
 */
export function loadBackendEnv() {
  const { loadEnv } = require('@medusajs/framework/utils');
  loadEnv(process.env.NODE_ENV || 'development', BACKEND_DIR);
}
