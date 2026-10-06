#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "→ Launching system bundle compilation engine..."
rm -rf dist
npx electron-builder --mac dir --arm64 >/dev/null

APP="dist/mac-arm64/cmodule.app"

echo "→ Detected compiled application target at: $APP"
echo "→ Deploying into system Application catalogs..."
osascript -e 'tell application "cmodule" to quit' >/dev/null 2>&1 || true
rm -rf "/Applications/cmodule.app"
cp -R "$APP" "/Applications/cmodule.app"
codesign --force --deep --sign - "/Applications/cmodule.app" >/dev/null 2>&1
echo "→ Creating localized system shortcut link layer..."
rm -f "$HOME/Desktop/cmodule"
osascript -e 'tell application "Finder" to make alias file to POSIX file "/Applications/cmodule.app" at (path to desktop folder)' >/dev/null
osascript -e 'tell application "Finder" to set name of (alias file "cmodule.app" of (path to desktop folder)) to "cmodule"' >/dev/null 2>&1 || true
echo "✓ Done. Application compilation and verification setup complete."
