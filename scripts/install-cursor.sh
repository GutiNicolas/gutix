#!/usr/bin/env bash
# Regenerate gutix's Cursor copy. Re-run after every pull. Extra flags go to `gutix.mjs install-cursor`
# (for example --project <dir> or --replace-port).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec node "$here/gutix.mjs" install-cursor "$here/.." --prefix gutix- "$@"
