#!/usr/bin/env bash
# Shared by pg-backup.sh, pg-restore.sh and test-backup-restore.sh: refuses to
# touch a database when the client tool's major version differs from the
# server's, in direct (non docker-exec) mode.
#
# Measured 2026-09-24: pg_dump/pg_restore 18.6 (Homebrew libpq) against a
# Postgres 16.13 server. The dump succeeded, but the archive's own preamble
# carries `SET transaction_timeout = 0;` (a GUC that exists only from
# Postgres 17 on), because pg_dump writes the settings ITS OWN version
# assumes, not the server's. Restoring that archive into any 16.x server then
# fails with `unrecognized configuration parameter "transaction_timeout"`.
# The same class of break can go the other way (an older client missing a
# newer server's defaults), so the check is a plain inequality, not a
# direction.
#
# Docker-exec mode never calls this: the client binary runs inside the same
# container image as the server, so the two versions are identical by
# construction (see pg-backup.sh / pg-restore.sh header comments).
#
# Usage: pg_backup_require_matching_version <tool-bin> <a reachable database URL> <psql-bin>
# Prints an error naming both versions and the fix, and returns 1, on a
# mismatch. Returns 0 (silently) on a match.
pg_backup_require_matching_version() {
  local bin="$1" database_url="$2" psql_bin="$3"
  local client_version_output client_major server_version_num server_major

  client_version_output="$("$bin" --version 2>&1 | head -1)"
  client_major="$(echo "$client_version_output" | grep -oE '[0-9]+' | head -1)"

  if ! server_version_num="$("$psql_bin" "$database_url" -t -A -v ON_ERROR_STOP=1 -c "SHOW server_version_num;" 2>&1)"; then
    echo "[pg-backup] error: could not read server_version_num from the server: $server_version_num" >&2
    return 1
  fi
  server_major=$((server_version_num / 10000))

  if [[ "$client_major" != "$server_major" ]]; then
    echo "[pg-backup] error: $bin is major version $client_major ($client_version_output)," \
      "the server is major version $server_major (server_version_num=$server_version_num)." >&2
    echo "[pg-backup] a client/server major version mismatch can embed or expect GUCs the other" \
      "side does not have (measured: a PG18 pg_dump embedded a 'SET transaction_timeout' the" \
      "target PG16 server does not recognize)." >&2
    echo "[pg-backup] fix: point PG_DUMP_BIN/PG_RESTORE_BIN/PSQL_BIN at binaries from Postgres" \
      "$server_major (e.g. Homebrew's postgresql@$server_major), or set" \
      "PG_DUMP_DOCKER_CONTAINER/PG_RESTORE_DOCKER_CONTAINER to run the tool inside the server's" \
      "own container, where the versions always match." >&2
    return 1
  fi
}
