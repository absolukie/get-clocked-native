#!/usr/bin/env bash
# Refresh web/ from the Get Clocked website repo, then wire the native bridge.
#
# Usage: ./sync-web.sh            (uses ~/workspace/get-clocked)
#        SITE_DIR=/path/to/repo ./sync-web.sh
set -euo pipefail
SITE_DIR="${SITE_DIR:-$HOME/workspace/get-clocked}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$ROOT/web"

rm -rf "$DEST"
mkdir -p "$DEST/js" "$DEST/css"
cp "$SITE_DIR/index.html" "$SITE_DIR/favicon.svg" "$SITE_DIR/manifest.json" "$SITE_DIR/config.json" "$DEST/"
cp "$SITE_DIR/css/"*.css "$DEST/css/"
cp "$SITE_DIR/js/"*.js "$DEST/js/"

# native bridge shim -> web/js/native-bridge.js, <script> tag before js/app.js
# so window.BoyGamesNative exists before the app's scripts run.
cp "$ROOT/plugins/native-bridge-shim.js" "$DEST/js/native-bridge.js"
python3 - "$DEST/index.html" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
tag = '<script src="js/native-bridge.js"></script>\n'
assert tag not in s, "shim tag already present"
anchor = '<script src="js/app.js"></script>'
assert anchor in s, "anchor <script src=\"js/app.js\"> not found in index.html"
s = s.replace(anchor, tag + anchor, 1)
open(p, "w").write(s)
print("injected js/native-bridge.js before js/app.js")
EOF

echo "web/ synced from $SITE_DIR"
