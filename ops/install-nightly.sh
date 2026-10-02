#!/bin/sh
# Installs (or reinstalls) the nightly ingest as a launchd agent for this user.
# Safe to re-run: it unloads any previous copy first.
set -eu

LABEL=com.tradesence.nightly
REPO=$(cd "$(dirname "$0")/.." && pwd)
BUN=$(command -v bun)
LOG="$HOME/Library/Logs/tradesence-nightly.log"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

sed -e "s|__BUN__|$BUN|" -e "s|__REPO__|$REPO|" -e "s|__LOG__|$LOG|g" \
  "$REPO/ops/$LABEL.plist" > "$DEST"
plutil -lint "$DEST" >/dev/null

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"

echo "Installed $DEST"
echo "Logs:     $LOG"
echo "Run now:  launchctl kickstart gui/$(id -u)/$LABEL"
