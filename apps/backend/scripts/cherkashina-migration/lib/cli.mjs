// One place that knows how these scripts answer `--help` and how they refuse a
// call that is missing a required option. Every script in this directory keeps
// its own option list; this only prints it, so `--help` never has to reach the
// body of a script that would otherwise open a file or a database first.

/** Prints the script's usage and exits 0 when the call asked for it. */
export function cliHelp(argv, usage) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage.trim());
    process.exit(0);
  }
}

/** Refuses a call: the reason first, then the same usage text `--help` prints. */
export function cliDie(usage, message) {
  console.error(message);
  console.error("");
  console.error(usage.trim());
  process.exit(2);
}

/**
 * The public origin a host belongs to. A tenant on the platform is
 * `https://<handle>.shipshift.dev`; a local stand is plain http, and that is
 * the only case this guesses, so a typo cannot silently downgrade a live run.
 */
export function originOfHost(host) {
  if (/^https?:\/\//.test(host)) return host.replace(/\/+$/, "");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || /\.localhost(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host.replace(/\/+$/, "")}`;
}
