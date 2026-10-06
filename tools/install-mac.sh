#!/bin/bash
# Builds "Cue AI.app", installs it in /Applications and puts a shortcut on the Desktop.
set -e
cd "$(dirname "$0")/.."
echo "→ Building Cue AI.app (about a minute the first time)…"
npx electron-builder --mac dir --arm64 >/dev/null
APP=$(ls -d dist/mac*/"Cue AI.app" | head -1)
echo "→ Installing to /Applications"
osascript -e 'tell application "Cue AI" to quit' >/dev/null 2>&1 || true
rm -rf "/Applications/Cue AI.app"
cp -R "$APP" "/Applications/Cue AI.app"
codesign --force --deep --sign - "/Applications/Cue AI.app" >/dev/null 2>&1   # local ad-hoc signature so macOS lets it run
echo "→ Adding a Desktop shortcut"
rm -f "$HOME/Desktop/Cue AI"
osascript -e 'tell application "Finder" to make alias file to POSIX file "/Applications/Cue AI.app" at (path to desktop folder)' >/dev/null
osascript -e 'tell application "Finder" to set name of (alias file "Cue AI.app" of (path to desktop folder)) to "Cue AI"' >/dev/null 2>&1 || true
echo "✓ Done. Double-click 'Cue AI' on your Desktop (or find it in Launchpad / Spotlight)."
