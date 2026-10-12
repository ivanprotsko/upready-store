# deploy/auto: dev releases itself, on each host (t-2026-10-12-30)

Ivan, 12.10.2026 18:04: «вливай и делай деплой, в следующий раз не жди и сразу делай это».
Ivan, 11.10.2026: «нужно сделать чтобы агенты сами не могли ничего делать, всё это должно управляться
снаружи системы… чтобы случайная ошибка агентов не могло ничего поломать».

A merge into `dev` is released by the hosts themselves. No agent session, no Mac and no GitHub Actions
job starts it. The checks stay in GitHub Actions (`.github/workflows/pr-checks.yml`, now on every push to
dev as well); the hosts read their result.

```
merge into dev ──► PR Checks on the dev commit (push trigger, self-hosted runner)
                        │ all four jobs green
                        ▼
INTL host: release agent, every 2 min ──► deploy-instance.sh intl <sha> --on-host
                        │ step 6 green ──► commit status release/intl = success
                        ▼
RU host:   release agent, every 2 min ──► deploy-instance.sh ru <sha> --on-host
                                          └► commit status release/ru = success
```

| File | What it is |
|---|---|
| `release-agent.sh` | One tick of the agent: the switch, the choice of the commit, the release, the journal, the status. Its header is the full description. |
| `install.sh`, `uninstall.sh` | Put the agent and its systemd timer on a host, or take them away. `--dry-run` prints everything and writes nothing. |
| `journal.schema.json`, `state.schema.json` | The two files the agent keeps in `/var/lib/upready-store-release/` on each host. |
| `journal-check.mjs` | Checks those files against the schemas and the rules a schema cannot say. |
| `../release-paths.txt` | The only paths a release carries to a host, read by the agent and by `deploy-instance.sh`. |

## The switch

The repository variable **`AUTO_RELEASE_DEV`**: GitHub → ivanprotsko/upready-store → Settings → Secrets
and variables → Actions → Variables. `on` releases; `off`, a missing variable or one GitHub does not
answer for means no new release starts. A release already running finishes. Each host reads it on every
tick and writes what it read into its `state.json`.

From a terminal: `gh variable set AUTO_RELEASE_DEV --body off --repo ivanprotsko/upready-store`.

Only Ivan flips it. docs/instances/RULES.md §4 says so for every agent.

## What the agent decides

- The commit: the newest commit of dev, newer than the last one this host released, whose run of
  `pr-checks.yml` passed all four jobs (Backend, Storefront, Panel And Repository, Deploy Checks). On RU it
  must also carry `release/intl = success`.
- A commit already in the journal is never taken again: a failed release is not retried. The next merge
  is the next release.
- Step 6 red: a check red before the release too (the `--verify-only` baseline) is a known red and does
  not fail the release; a new red gets three minutes to come back (the panel answers 502 for a moment
  after its restart); a red that stays fails the release at step 6.
- Nothing is rolled back by itself. Step 7 stays a person's act, with Ivan's ok.

## Where to look

On each host (read only):

- `systemctl list-timers upready-store-release.timer`, `journalctl -u upready-store-release`
- `/var/lib/upready-store-release/state.json`: the switch, what the agent waits for, the current and the
  last release
- `/var/lib/upready-store-release/journal.json`: every release
- `/var/lib/upready-store-release/logs/<id>/`: `baseline.out`, `release.out`, the deploy-instance.sh log

On GitHub: the statuses `release/intl` and `release/ru` next to the checks of each dev commit.

## Installing on a host

Only after Ivan's ok, by lead-upready-store, once per host. What Ivan does himself first:

1. Creates the GitHub App «upready-store-release» (github.com → Settings → Developer settings → GitHub
   Apps → New): no webhook; repository permissions **Actions: read, Contents: read, Commit statuses: read
   and write, Variables: read**, nothing else; installs it on ivanprotsko/upready-store only. Notes the
   App ID; generates a private key.
2. Puts the key on each host as `/etc/upready-store-release/github-app.pem` (`chmod 600`, owner root).
   No agent reads, copies or prints it.
3. Creates the variable `AUTO_RELEASE_DEV` = `off` until both hosts are installed, then `on`.

Then, from a release tree on the host that already holds this folder:

```
bash /opt/upready-store/mt/deploy/auto/install.sh --instance intl \
  --env-file /opt/upready-store/mt/shipshift.env --app-id <App ID> --live-sha <sha live on INTL> --dry-run
bash /opt/upready-store/mt/deploy/auto/install.sh --instance ru \
  --env-file /opt/upready-store/mt/ru-prod.env --app-id <App ID> --live-sha <sha live on RU> --dry-run
```

and the same without `--dry-run` once Ivan said yes to what it printed. `--live-sha` records the commit
live now, so the first tick does not release it again.

Why an App and not a token: no API token of Ivan's lives on either host, and a token of Ivan's account
shares the 5000 calls an hour every agent uses (it ran out on 12.10.2026 at 11:59 UTC until 12:37). An App
has its own limit. `GITHUB_TOKEN_FILE` in `release.env` is there for a token anyway.

What one host spends of the limit (t-2026-10-12-30, part D). Every GET asks with the ETag of its last
answer (`/var/lib/upready-store-release/etags/`), and a 304 does not count. The App's installation token
lives an hour; the agent keeps it in `/var/lib/upready-store-release/github-auth` (600, the only file there
with a secret) and signs in again five minutes before it ends. An hour with nothing new on dev, 30 ticks:
90 counted calls with a token and 150 with the App before; 0 and about 2 (one new token an hour) now.

## Tests

`node --test deploy/auto/__tests__/*.test.mjs deploy/scripts/__tests__/deploy-instance-on-host.test.mjs`:
GitHub is `__tests__/fake-curl.mjs`, the host is a temporary folder, `deploy-instance.sh` inside the
tarball is a stand-in. `result-line.test.mjs` runs the real `deploy-instance.sh` behind a slow `tee`, and
`pr-checks-runner.test.mjs` reads where each job of `.github/workflows` runs. The Deploy Checks job of
`pr-checks.yml` runs them.
