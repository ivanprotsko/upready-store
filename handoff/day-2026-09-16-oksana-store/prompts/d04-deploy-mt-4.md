# Goal

Deploy the CURRENT `dev` (fixes f09–f16 from the owner's QA run, on top of wave 3) to the live mt platform and prove it, exactly the way d03 did.

# Procedure

Read `{{MISSION_DIR}}/prompts/d03-deploy-mt-3.md` and follow its procedure UP TO the section «STATE AFTER ATTEMPT 3» (that section describes a past state — ignore it). In short: `pg_dump` of `medusa_mt` BEFORE anything (protected-infra memo), build the three images on the host from current `dev` with the same context the deploy uses, verify `docker run --rm <backend image> node -e "require('sharp')"` before `up -d`, then `up -d` → migrations → backfills → health sweep (the five URLs of the protected-infra memo plus the five cards of the client's shop d03 checked, listed in `{{MISSION_DIR}}/artifacts/d03-deploy-mt-3/report.md`) → post-deploy dump → report at `{{MISSION_DIR}}/artifacts/d04-deploy-mt-4/report.md` with every measurement. If the new backend cannot become healthy within 10 minutes, roll back to the image that was live before your deploy (note its ID first) and report the log lines. Every command in the foreground with a timeout; never wait for a notification; the LAST line is `RESULT: OK …` or `RESULT: FAIL …`.
