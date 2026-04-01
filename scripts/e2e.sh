#!/usr/bin/env bash
set -e

# Resolve the playwright-driver.browsers path from the nix store at runtime.
# This is deterministic as long as the nixpkgs channel (stable-25_05) stays the same.
NIX_BROWSERS=$(nix-build --no-out-link -E 'let pkgs = import <nixpkgs> {}; in pkgs.playwright-driver.browsers' 2>/dev/null)

if [ -z "$NIX_BROWSERS" ]; then
  echo "[e2e] WARNING: Could not resolve playwright-driver.browsers from nix. Falling back to local cache."
  NIX_BROWSERS=""
fi

export PLAYWRIGHT_BROWSERS_PATH="$NIX_BROWSERS"
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
export LD_LIBRARY_PATH="$REPLIT_LD_LIBRARY_PATH:$LD_LIBRARY_PATH"

echo "[e2e] PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
echo "[e2e] REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=$REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"

exec npx playwright test "$@"
