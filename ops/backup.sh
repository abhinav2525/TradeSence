#!/bin/sh
# Nightly database backup (decision 0021). Run by ingest:nightly after the
# ingest, or by hand with `bun run db:backup`.
#
# One compressed pg_dump per night, newest 7 kept. Restore with:
#   createdb tradesence_restore && pg_restore -d tradesence_restore <file>
#
# The default folder is on this Mac's own disk: it protects against a bad
# migration or a dropped table, not against the disk dying. Point
# TRADESENCE_BACKUP_DIR at iCloud Drive or an external disk for that.
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

# Newest first; delete everything past the first $KEEP.
ls -1t "$DIR"/tradesence-*.dump | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old"; done

echo "[backup] $FILE ($(du -h "$FILE" | cut -f1)), keeping $KEEP"
