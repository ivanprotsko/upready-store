#!/bin/bash
set -euo pipefail
echo "hw.memsize / hw.ncpu:"; sysctl -n hw.memsize hw.ncpu
echo "macOS version:"; sw_vers -productVersion
echo "node -v:"; node -v
echo "psql --version:"; /opt/homebrew/opt/postgresql@17/bin/psql --version
