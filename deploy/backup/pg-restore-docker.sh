#!/usr/bin/env bash
# pg-restore-docker.sh — pg_restore for a host without postgresql-client (contabo), used by
# deploy/backup/pg-backup.sh through PG_RESTORE_BIN for its `pg_restore -l <dump>` sanity check.
# Every argument that names an existing file is bind-mounted read-only at the same path inside a
# throwaway postgres:16-alpine container, so `pg_restore -l /opt/.../x.dump` works unchanged.
set -euo pipefail
mounts=()
for a in "$@"; do
  [ -f "$a" ] && mounts+=(-v "$a:$a:ro")
done
exec docker run --rm -i "${mounts[@]}" postgres:16-alpine pg_restore "$@"
