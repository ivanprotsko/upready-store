#!/bin/bash
# RSS of the running medusa develop process on :9025 (RSS is in KB from ps).
set -euo pipefail
PID=$(lsof -nP -iTCP:9025 -sTCP:LISTEN | awk 'NR==2{print $2}')
echo "pid=$PID"
ps -o pid,rss,command -p "$PID"
