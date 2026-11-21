#!/usr/bin/env bash
# Set gutix up on this machine: Cursor copy, optional org link, optional daily update. Asks questions; flags answer
# them (see `node scripts/gutix.mjs` for the list), for example --cursor --no-org --no-skeleton --replace-port.
set -euo pipefail
src="$0"
while [ -h "$src" ]; do
  dir="$(cd -P "$(dirname "$src")" && pwd)"
  src="$(readlink "$src")"
  case "$src" in /*) ;; *) src="$dir/$src" ;; esac
done
here="$(cd -P "$(dirname "$src")" && pwd)"
exec node "$here/gutix.mjs" install "$@"
