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

# launchd runs the nightly job with PATH=/usr/bin:/bin:/usr/sbin:/sbin, where
# pg_dump doesn't exist (decision 0021). Use the server's own version first, so
# a newer Postgres linked into /opt/homebrew/bin later can't break the dump.
PATH="/opt/homebrew/opt/postgresql@14/bin:/opt/homebrew/bin:$PATH"

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

# Date and time in the name, so no run ever replaces an existing file. In
# iCloud Drive, replacing a file that is still uploading blocks until the
# upload ends (a second same-day run hung on `mv` this way).
FILE="$DIR/tradesence-$(date +%Y-%m-%d-%H%M%S).dump"
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
MIRROR_LIMIT="${TRADESENCE_BACKUP_MIRROR_TIMEOUT:-600}" # seconds
# The iCloud copies are tracked in this local file. Listing the iCloud folder
# from the launchd job blocks forever in opendir() (macOS lets a background
# job open a file there by name, not list the folder), so the folder is only
# ever touched by exact path: cp, mv, rm.
MANIFEST="$DIR/.mirrored"
STALE="$DIR/.mirror-stale" # half-copied files a stopped run left in iCloud

mirror() {
  name=$(basename "$FILE")
  mkdir -p "$MIRROR"
  if [ -f "$STALE" ]; then
    while read -r f; do rm -f "$MIRROR/$f"; done < "$STALE"
    rm -f "$STALE"
  fi
  cp "$FILE" "$MIRROR/$name.partial"
  mv "$MIRROR/$name.partial" "$MIRROR/$name"
  echo "$name" >> "$MANIFEST"
  n=$(wc -l < "$MANIFEST")
  if [ "$n" -gt "$MIRROR_KEEP" ]; then
    head -n "$((n - MIRROR_KEEP))" "$MANIFEST" | while read -r old; do rm -f "$MIRROR/$old"; done
    tail -n "$MIRROR_KEEP" "$MANIFEST" > "$MANIFEST.new"
    mv "$MANIFEST.new" "$MANIFEST"
  fi
}

# Deleting old iCloud copies can fail from the launchd job (macOS blocks it
# there, decision 0021). Each copy is listed in $MANIFEST until it is deleted,
# so a list this long means deletions have failed for 3 nights: stop adding
# copies rather than fill the owner's iCloud storage.
MIRROR_CAP=$((MIRROR_KEEP + 3))
if [ -n "$MIRROR" ] && [ -f "$MANIFEST" ] && [ "$(wc -l < "$MANIFEST")" -ge "$MIRROR_CAP" ]; then
  echo "[backup] WARNING old iCloud copies could not be deleted for 3 nights; not adding more until they are (see decision 0021)" >&2
  MIRROR=""
fi

if [ -n "$MIRROR" ]; then
  # In the background with a time limit: iCloud can stall in ways a script
  # can't see (an upload in progress, a missing permission), and the nightly
  # job must never hang on it. A failed or stopped copy is a warning only; the
  # local copy is already safe.
  ( set -e; mirror ) &
  pid=$!
  waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt "$MIRROR_LIMIT" ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    echo "$(basename "$FILE").partial" >> "$STALE" # removed by the next run
    echo "[backup] WARNING iCloud copy stopped after ${MIRROR_LIMIT}s; the local copy is fine" >&2
  elif wait "$pid"; then
    echo "[backup] copied to iCloud Drive, keeping $MIRROR_KEEP"
  else
    echo "[backup] WARNING could not copy to $MIRROR; the local copy is fine" >&2
  fi
fi
