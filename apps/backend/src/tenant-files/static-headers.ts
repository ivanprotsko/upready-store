import { staticFileHeaders } from "./upload-policy";

/**
 * Puts `staticFileHeaders` on everything the backend serves from `static/`
 * (architecture review 2026-09-21, finding S-4).
 *
 * Why it is done this way. The framework mounts the directory itself,
 * `app.use("/static", express.static(...))` in
 * `@medusajs/framework/dist/http/express-loader.js`, with the comment
 * "Currently we don't allow configuration of static files", and it mounts it
 * before it loads `src/api`, so no middleware of this project ever sees a
 * request for a file that exists. What the project does run before that mount
 * is `medusa-config.ts`. So this wraps `express.static` there, once, and only
 * adds a `setHeaders` option to the call the framework makes.
 *
 * It reaches for the framework's own copy of express, because `apps/backend`
 * does not depend on express and another copy would be another object.
 *
 * `integration-tests/http/tenant-uploads-active-types.spec.ts` reads the
 * headers off a served file, so an upgrade that moves the mount turns that
 * spec red. When the framework learns to configure static files, delete this.
 */

type SetHeaders = (res: { setHeader: (name: string, value: string) => void }, filePath: string) => void;
type ServeStatic = (root: string, options?: { setHeaders?: SetHeaders }) => unknown;

const WRAPPED = Symbol.for("upready.static-headers");

export const installStaticFileHeaders = (): void => {
  try {
    const express = require(
      require.resolve("express", { paths: [require.resolve("@medusajs/framework/http")] }),
    ) as { static: ServeStatic & { [WRAPPED]?: true } };

    if (express.static[WRAPPED]) return;

    const serveStatic = express.static;
    const wrapped = ((root, options) =>
      serveStatic(root, {
        ...options,
        setHeaders: (res, filePath) => {
          options?.setHeaders?.(res, filePath);
          for (const [name, value] of Object.entries(staticFileHeaders(filePath))) {
            res.setHeader(name, value);
          }
        },
      })) as ServeStatic & { [WRAPPED]?: true };

    wrapped[WRAPPED] = true;
    express.static = wrapped;
  } catch (error) {
    // A backend without these headers still has to start; the spec above is
    // what says loudly that they are gone.
    console.warn(`[static-headers] not installed: ${(error as Error).message}`);
  }
};
