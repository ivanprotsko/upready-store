#!/bin/zsh
# Retry wrapper for the images stage: transient 502s from the shared engine must not
# end the run. The importer is idempotent — rows already `migrated` are skipped.
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/apps/backend/scripts/cherkashina-migration
ART="$1"; SRC="$2"; PW="$3"; PHASE="$4"
for i in 1 2 3 4 5 6; do
  echo "=== attempt $i of phase $PHASE at $(date '+%H:%M:%S') ==="
  node import.mjs --backend https://shipshift.dev \
    --snapshot "$SRC/source-snapshot.json" \
    --registry "$ART/02-mapping-registry-live.json" \
    --source-root /Users/ivanprotsko/upready/projects/chrxnasdmds \
    --pages-out "$ART/pages" --handle cherkashino --name "Оксана Черкашина" \
    --tenant-host cherkashino.shipshift.dev \
    --admin-email ivanprotsko+cherkashino@ivanprotsko.com --admin-password "$PW" \
    --only "$PHASE"
  rc=$?
  echo "=== attempt $i rc=$rc ==="
  [ $rc -eq 0 ] && { echo "PHASE-DONE $PHASE rc=0"; exit 0; }
  sleep 15
done
echo "PHASE-GIVEUP $PHASE"; exit 1
