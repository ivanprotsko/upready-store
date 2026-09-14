# Goal

Final deploy of the day. Everything merged after wave 2 goes live, and the report of this task is what the
evening gap re-check and Ivan's summary describe as «стоит на живом магазине».

Follow `{{MISSION_DIR}}/prompts/d01-deploy-mt-1.md` for the recipe and the rules, and
`{{MISSION_DIR}}/prompts/d02-deploy-mt-2.md` for the wave-2 additions (change list, migrations, new variables,
backfills). This file states only what is extra.

## Extra for the final wave

1. **Read the previous sha** from `{{MISSION_DIR}}/artifacts/d02-deploy-mt-2/report.md` and list the change set
   since it.
2. **Full merged list of the day.** Produce the complete list of pull requests merged today, with numbers and
   titles, and put it in the report. That list is quoted verbatim by `r02-handover`:

```
gh pr list --repo ivanprotsko/upready-store --state merged --search "merged:>=$(date -u +%Y-%m-%d)" --json number,title,mergedAt,headRefName --limit 100
```

3. **A fresh backup after the deploy as well as before it**, so the day ends with a dump of the state the
   client's shop is actually in. Print both paths and both sizes.
4. **Media check.** The shop's images live on one host with no S3 and no automatic backup
   (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Бэкапы»). Report the size of
   `/opt/upready-store/media-tenants` and how many files belong to the client's tenant directory. Do not try to
   fix the backup gap today: name it in the report as a risk with its number.
5. **Final health sweep**, the same five URLs as wave 2, plus five product pages of the client's shop picked at
   random, each with its status code.

## Finish

```
ARTIFACT: {{MISSION_DIR}}/artifacts/{{TASK_ID}}/report.md
RESULT: OK финальный деплой <sha> — 5/5 + 5 карточек 200, за день смёржено <N> PR
```

or `RESULT: FAIL <what exactly failed>` as the last line.

## Commands

```
cd {{MAIN_CHECKOUT}} && git fetch origin {{BASE}} && git log --oneline <sha of wave 2>..origin/{{BASE}} && git rev-parse --short origin/{{BASE}}

# backup before
ssh -n contabo 'docker exec mt-postgres pg_dump -U postgres -Fc medusa_mt > /opt/upready-store/backups/medusa_mt-pre-d03-$(date +%Y%m%d-%H%M%S).dump'

# ... rsync / build / up as in d01 ...

# backup after
ssh -n contabo 'docker exec mt-postgres pg_dump -U postgres -Fc medusa_mt > /opt/upready-store/backups/medusa_mt-post-d03-$(date +%Y%m%d-%H%M%S).dump && ls -la /opt/upready-store/backups/ | tail -4'

# media footprint
ssh -n contabo 'du -sh /opt/upready-store/media-tenants && ls /opt/upready-store/media-tenants | wc -l'

# health
for u in https://shipshift.dev/health https://start.upready.dev/start/onboarding https://panel-store.upready.dev/ https://cherkashino.shipshift.dev/ru https://zolotaya-nit-1057.shipshift.dev/ru; do printf "%-55s " "$u"; curl -s -o /dev/null -w "%{http_code}\n" --max-time 25 -L "$u"; done
```

Pick five product URLs from the client's shop by reading her catalogue page, not by guessing handles, and curl
each one.

## Acceptance

- Five platform URLs and five product pages of the client's shop all at 200, each quoted with its code.
- Two dump paths with sizes, one before and one after.
- The complete list of pull requests merged today, with numbers and titles.
- The media directory size and the client tenant's file count.
- The deployed sha, and the image `CreatedAt` inside this run.

## What NOT to do

- Same prohibitions as wave 2: no push, no merge, no product commit, no `down`, no prune, no volume or image
  removal, no restore, no invented environment value.
- Do not start a new build after the final health sweep passes: the report must describe the state that is
  actually serving.
- If something merged today breaks the live shop, report it with evidence and leave it: choosing between a
  rollback and a fix-forward is Ivan's call, and the shop has a dump from ten minutes earlier.
