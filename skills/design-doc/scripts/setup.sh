#!/usr/bin/env bash
# Installs the render dependencies once, outside the repo. Safe to run again: it only installs what is missing.
#   bash setup.sh
# Location: $GUTIX_DEPS, default ~/.cache/gutix. Chrome is not downloaded: render.mjs drives the system Chrome
# ($CHROME_PATH, the macOS app, or google-chrome / chromium / chromium-browser on PATH).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS="${GUTIX_DEPS:-$HOME/.cache/gutix}"
PACKAGES=(playwright-core)

mkdir -p "$DEPS"
cd "$DEPS"
[ -f package.json ] || npm init -y >/dev/null

missing=()
for package in "${PACKAGES[@]}"; do
	[ -f "node_modules/$package/package.json" ] || missing+=("$package")
done

if [ ${#missing[@]} -gt 0 ]; then
	PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund --loglevel=error "${missing[@]}"
	echo "setup: installed ${missing[*]} in $DEPS"
else
	echo "setup: dependencies already in $DEPS"
fi

if ! chrome="$(node "$HERE/render.mjs" --find-chrome)"; then
	echo "setup: Chrome not found; install Google Chrome or Chromium, or set CHROME_PATH to its binary" >&2
	exit 1
fi
echo "setup: OK (Chrome: $chrome)"
