#!/bin/sh
for base in \
  /media/cryptofs/apps/usr/palm/applications \
  /media/developer/apps/usr/palm/applications
do
  [ -d "$base" ] || continue
  for manifest in "$base"/*/appinfo.json
  do
    [ -f "$manifest" ] || continue
    id=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
    title=$(sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
    version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
    printf '%s|%s|%s\n' "$id" "$title" "$version"
  done
done | sort -u
