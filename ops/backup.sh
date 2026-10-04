#!/bin/sh
# Nightly database backup (decision 0021). Run by ingest:nightly after the
# ingest, or by hand with `bun run db:backup`.
#
# One compressed pg_dump per night, newest 7 kept. Restore with:
#   createdb tradesence_restore && pg_restore -d tradesence_restore <file>
#
# Two copies (decision 0021): this Mac's disk (newest 7), for undoing a bad
# migration or a dropped table, and iCloud Drive (newest 3, to spare iCloud
# space), for when the disk itself dies. TRADESENCE_BACKUP_DIR /
# TRADESENCE_BACKUP_MIRROR move them; MIRROR="" turns the iCloud copy off.
set -eu

# bun loads .env for TypeScript but not for a package script's shell, so read
# DATABASE_URL from the repo's .env when the caller didn't pass it.
REPO=$(cd "$(dirname "$0")/.." && pwd)
if [ -z "${DATABASE_URL:-}" ] && [ -f "$REPO/.env" ]; then
  DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' "$REPO/.env" | tr -d '"'"'")
fi
: "${DATABASE_URL:?DATABASE_URL not set and not found in .env}"
DIR="${TRADESENCE_BACKUP_DIR:-$HOME/Backups/tradesence}"
KEEP="${TRADESENCE_BACKUP_KEEP:-7}"
mkdir -p "$DIR"

FILE="$DIR/tradesence-$(date +%Y-%m-%d).dump"
# Written under a temporary name and renamed, so a dump that dies half-way is
# never mistaken for a good one (and never pushes a good one out of the 7).
pg_dump --format=custom --compress=6 --file="$FILE.partial" "$DATABASE_URL"
mv "$FILE.partial" "$FILE"

# Newest first; delete everything past the first $1 in folder $2.
prune() {
  ls -1t "$2"/tradesence-*.dump | tail -n +"$(($1 + 1))" | while read -r old; do rm -f "$old"; done
}
prune "$KEEP" "$DIR"
echo "[backup] $FILE ($(du -h "$FILE" | cut -f1)), keeping $KEEP"

MIRROR="${TRADESENCE_BACKUP_MIRROR-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/tradesence}"
MIRROR_KEEP="${TRADESENCE_BACKUP_MIRROR_KEEP:-3}"
if [ -n "$MIRROR" ]; then
  # A failed iCloud copy must not fail the run: the local copy is already safe.
  if mkdir -p "$MIRROR" && cp "$FILE" "$MIRROR/$(basename "$FILE").partial" \
     && mv "$MIRROR/$(basename "$FILE").partial" "$MIRROR/$(basename "$FILE")"; then
    prune "$MIRROR_KEEP" "$MIRROR"
    echo "[backup] copied to $MIRROR, keeping $MIRROR_KEEP"
  else
    echo "[backup] WARNING could not copy to $MIRROR; the local copy is fine" >&2
  fi
fi
