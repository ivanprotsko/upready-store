# Goal

Second deploy of the day: put everything merged since wave 1 on the live host, so the QA tasks measure today's
code on the client's real shop and not yesterday's.

Follow `{{MISSION_DIR}}/prompts/d01-deploy-mt-1.md` exactly: the same authorisation, the same protected-infra
rules, the same recipe, the same health checks. This file only states what is different.

## Different from wave 1

1. **The shop now exists.** `https://cherkashino.shipshift.dev/ru` must return 200 before you start and 200
   after you finish. Check it first: if it is already broken before your deploy, that is a finding to report
   and not something your deploy caused. Add it to the health-check loop.
2. **Say what you are shipping.** Before the rsync, list what changed since the previous deploy:

```
git fetch origin dev
git log --oneline <sha of wave 1>..origin/dev
gh pr list --repo ivanprotsko/upready-store --state merged --search "merged:>=$(date -u +%Y-%m-%d)" --json number,title,mergedAt --limit 50
```

   The previous deploy's sha is in `{{MISSION_DIR}}/artifacts/d01-deploy-mt-1/report.md`. Read it from there,
   never from memory.
3. **New migrations.** Several of today's tasks add tables. After the build and before `up -d` for the backend,
   check whether migrations need running on the live database and run them the way this repository does it,
   with the `pg_dump` already taken. If a migration fails, stop, restore nothing by hand, and report: a failed
   migration on a live database is Ivan's decision, not yours.
4. **New environment variables.** Today's tasks may add optional variables (SMTP for notifications, an
   encryption key for integration secrets). The real values live only in
   `/opt/upready-store/mt/deploy/mt/shipshift.env` on the host. If a merged task needs a variable that is not
   there, **do not invent it**: deploy what you can, and list the missing names in the report as something only
   Ivan can fill. A feature that stays off because its variable is unset is a correct outcome; a feature that
   crashes the backend on boot because of it is a finding.
5. **Post-deploy backfills.** Run the ones the memory records (`backfill-hero-copy`, `backfill-option-translations`)
   plus any backfill a merged task shipped, each with its `--dry-run` first where it has one.

## Health checks

```
for u in https://shipshift.dev/health https://start.upready.dev/start/onboarding https://panel-store.upready.dev/ https://cherkashino.shipshift.dev/ru https://zolotaya-nit-1057.shipshift.dev/ru; do printf "%-55s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 25 -L "$u"; done
```

All five must be 200. Then re-check that the client's shop still shows its own catalogue and not a demo one:
open the catalogue page and count the products.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK deploy <sha> — 5/5 health checks 200, смёржено сегодня: <N задач>
```

or `RESULT: FAIL <what exactly failed>` as the last line.

## Acceptance

- Five health URLs at 200, quoted with their codes.
- The deployed sha is named and differs from wave 1's; the change list between them is in the report.
- The `pg_dump` taken before the operation exists; its path and size are printed.
- The client's catalogue page still lists her products, with the count you measured.
- Every migration that ran is named with its result; every environment variable a merged task needs and the
  host does not have is listed by name.
- The image `CreatedAt` on the host is inside this run's time window, which is the only proof the new code is
  serving (there is no `.git` on the host).

## What NOT to do

- Do not push, do not merge a pull request, do not commit product code. Journals on `{{BASE}}` carry both
  `IVAN_OK=1` and `BASE_COMMIT_OK=1`.
- Do not edit `shipshift.env` beyond adding a variable a merged task genuinely requires, and never a secret
  value you made up.
- Do not `docker compose down`, do not prune, do not remove a volume, an image or a container.
- Do not restore a backup, and do not re-run the client's catalogue import: if her shop lost data, that is a
  finding for Ivan, not a repair you improvise.
