#!/bin/bash
# Builds "cmodule.app", installs it in /Applications and puts a shortcut on the Desktop.
set -e
cd "$(dirname "$0")/.."
echo "→ Building cmodule.app (about a minute the first time)…"
npx electron-builder --mac dir --arm64 >/dev/null
APP=$(ls -d dist/mac*/"cmodule.app" | head -1)
echo "→ Installing to /Applications"
osascript -e 'tell application "cmodule" to quit' >/dev/null 2>&1 || true
rm -rf "/Applications/cmodule.app"
cp -R "$APP" "/Applications/cmodule.app"
codesign --force --deep --sign - "/Applications/cmodule.app" >/dev/null 2>&1   # local ad-hoc signature so macOS lets it run
echo "→ Adding a Desktop shortcut"
rm -f "$HOME/Desktop/cmodule"
osascript -e 'tell application "Finder" to make alias file to POSIX file "/Applications/cmodule.app" at (path to desktop folder)' >/dev/null
osascript -e 'tell application "Finder" to set name of (alias file "cmodule.app" of (path to desktop folder)) to "cmodule"' >/dev/null 2>&1 || true
echo "✓ Done. Double-click 'cmodule' on your Desktop (or find it in Launchpad / Spotlight)."
