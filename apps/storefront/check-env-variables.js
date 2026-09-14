const c = require("ansi-colors");

/**
 * Was `[{ key: "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" }]`, and the missing key
 * exited the process before Next started — `next.config.js` calls this at the
 * top, so `next dev`, `next build` and `next lint` all died on it.
 *
 * Since piece 9 (docs/multitenancy/storefront-by-host.md) the publishable key
 * is resolved PER REQUEST from the Host header, so a multi-shop deployment
 * legitimately runs with no key in its environment at all; the variable is now
 * the single-store fallback for a host that resolves to no shop. Requiring it
 * would make the supported configuration unstartable.
 *
 * Nothing else was required here, so the list is empty rather than deleted: the
 * next required variable goes back in as one entry.
 */
const requiredEnvs = [];

function checkEnvVariables() {
  const missingEnvs = requiredEnvs.filter((env) => {
    c;
    return !process.env[env.key];
  });

  if (missingEnvs.length > 0) {
    console.error(
      c.red.bold("\n🚫 Error: Missing required environment variables\n")
    );

    missingEnvs.forEach((env) => {
      console.error(c.yellow(`  ${c.bold(env.key)}`));
      if (env.description) {
        console.error(c.dim(`    ${env.description}\n`));
      }
    });

    console.error(
      c.yellow(
        "\nPlease set these variables in your .env file or environment before starting the application.\n"
      )
    );

    process.exit(1);
  }
}

module.exports = checkEnvVariables;
