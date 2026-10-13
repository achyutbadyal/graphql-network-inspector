#!/usr/bin/env bash
#
# Build and sign the Firefox build of GraphQL Network Inspector.
#
# Why signing: Firefox and Zen require a signature for an add-on to persist
# across restarts. Unsigned add-ons loaded from about:debugging are temporary by
# design, and `xpinstall.signatures.required = false` no longer works on release
# builds. An AMO signature on the "unlisted" channel is free, never publicly
# listed, and gives you an .xpi that installs permanently.
#
# Usage:
#   ./scripts/sign-firefox.sh                build + sign (unlisted)
#   ./scripts/sign-firefox.sh --open         ...and open the signed .xpi
#   ./scripts/sign-firefox.sh --build-only   build only, no signing
#   ./scripts/sign-firefox.sh --lint         build, then run web-ext lint
#   ./scripts/sign-firefox.sh --channel listed
#
# AMO API credentials are loaded from .env in the repo root:
#   WEB_EXT_API_KEY=...
#   WEB_EXT_API_SECRET=...
#   Create them at https://addons.mozilla.org/developers/addon/api/key/
#
# Needs bash (macOS, Linux, or Git Bash / WSL on Windows).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

BUILD_DIR="$ROOT/build"
DIST_DIR="$ROOT/dist"
CHANNEL="${WEB_EXT_CHANNEL:-unlisted}"

MODE="sign"
OPEN_AFTER=false

while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) MODE="build"; shift ;;
    --lint)       MODE="lint"; shift ;;
    --open)       OPEN_AFTER=true; shift ;;
    --channel)    CHANNEL="${2:-unlisted}"; shift 2 ;;
    -h|--help)    sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Prefer a locally installed web-ext, fall back to npx so there's nothing to
# add to package.json / the lockfile.
if [ -x "$ROOT/node_modules/.bin/web-ext" ]; then
  WEB_EXT=("$ROOT/node_modules/.bin/web-ext")
else
  WEB_EXT=(npx --yes web-ext@latest)
fi

require_credentials() {
  if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
    echo "error: signing needs AMO API credentials." >&2
    echo >&2
    echo "  1. Sign in at https://addons.mozilla.org" >&2
    echo "  2. Generate keys at https://addons.mozilla.org/developers/addon/api/key/" >&2
    echo "  3. Put them in .env at the repo root:" >&2
    echo "       WEB_EXT_API_KEY=..." >&2
    echo "       WEB_EXT_API_SECRET=..." >&2
    exit 1
  fi
}

# 1. Build. `yarn build` runs the CRA build, then copies the version out of
#    package.json (Yarn 4 does not run postbuild). build:firefox then rewrites
#    the manifest for Firefox: drops service_worker, drops Chrome-only
#    permissions, and sets the gecko id.
#
#    NOTE: this build currently fails most of the time with
#    `EEXIST: file already exists, mkdir '<root>/build'`. That is NOT caused by a
#    stale build/ (it reproduces from a clean directory) and NOT by
#    copy-webpack-plugin or webpack's own mkdirp (both tolerate an existing dir).
#    Root cause is still unresolved.
#
#    build/ is removed up front and the build retried once because the failure is
#    intermittent — one run in seven succeeded — but do not expect the retry to
#    rescue it reliably.
build_firefox() {
  local attempt
  for attempt in 1 2; do
    if [ -d "$BUILD_DIR" ]; then
      echo "==> removing stale build/"
      rm -rf "$BUILD_DIR"
    fi
    echo "==> yarn build:firefox (attempt $attempt)"
    if yarn build:firefox; then
      return 0
    fi
    echo "!! attempt $attempt failed" >&2
  done
  return 1
}

if ! build_firefox; then
  echo >&2
  echo "error: yarn build:firefox failed twice." >&2
  echo >&2
  echo "If the error was 'EEXIST: file already exists, mkdir .../build', that is an" >&2
  echo "unresolved flake in this toolchain. Removing build/ does not fix it." >&2
  echo "Worth trying, in order:" >&2
  echo "  1. Node 24 - the project's .nvmrc is lts/*, and this was reproduced on Node 22" >&2
  echo "  2. rm -rf node_modules && yarn install" >&2
  echo "  3. yarn build (no :firefox) to confirm it is not manifest rewriting" >&2
  exit 1
fi

if [ ! -f "$BUILD_DIR/manifest.json" ]; then
  echo "error: $BUILD_DIR/manifest.json missing after build" >&2
  exit 1
fi

# 2. Sanity-check the post-build manifest. Signing fails late and confusingly if
#    these are wrong, so catch them here instead.
node -e '
const m = require("./build/manifest.json");
const problems = [];
if (!m.browser_specific_settings?.gecko?.id) {
  problems.push("browser_specific_settings.gecko.id is missing (AMO needs a stable id)");
}
if (!m.browser_specific_settings?.gecko?.data_collection_permissions) {
  problems.push("browser_specific_settings.gecko.data_collection_permissions is missing (AMO requires it)");
}
if (m.background?.service_worker) {
  problems.push("background.service_worker is still present (Firefox MV3 needs background.scripts)");
}
if (!m.version || m.version === "1.0") {
  problems.push(`version looks unsynced: ${m.version} (set-manifest-version.js should copy package.json)`);
}
if (problems.length) {
  console.error("error: built manifest is not Firefox-ready:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`    manifest ok: v${m.version}, id ${m.browser_specific_settings.gecko.id}`);
'

if [ "$MODE" = "lint" ]; then
  echo "==> web-ext lint"
  "${WEB_EXT[@]}" lint --source-dir "$BUILD_DIR"
  exit 0
fi

if [ "$MODE" = "build" ]; then
  echo
  echo "Built $BUILD_DIR (unsigned)."
  echo "Re-run without --build-only to sign it."
  exit 0
fi

# 3. Sign.
require_credentials

mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR"/*.xpi

echo "==> web-ext sign (channel: $CHANNEL)"
"${WEB_EXT[@]}" sign \
  --source-dir "$BUILD_DIR" \
  --artifacts-dir "$DIST_DIR" \
  --channel "$CHANNEL" \
  --api-key "$WEB_EXT_API_KEY" \
  --api-secret "$WEB_EXT_API_SECRET"

XPI="$(find "$DIST_DIR" -name '*.xpi' -print -quit || true)"

if [ -z "$XPI" ]; then
  echo "error: signing reported success but no .xpi landed in $DIST_DIR" >&2
  exit 1
fi

echo
echo "Signed: $XPI"

if [ "$OPEN_AFTER" = true ]; then
  case "$(uname -s)" in
    Darwin) open -a Zen "$XPI" 2>/dev/null || open "$XPI" ;;
    Linux)  xdg-open "$XPI" >/dev/null 2>&1 || true ;;
    *)      start "" "$XPI" 2>/dev/null || true ;;
  esac
  echo "Opened in your browser - confirm the install prompt."
else
  echo "Install it from about:addons > gear icon > Install Add-on From File,"
  echo "or re-run with --open."
fi
