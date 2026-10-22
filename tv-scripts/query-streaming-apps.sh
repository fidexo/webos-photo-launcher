#!/bin/sh

for base in \
  /media/cryptofs/apps/usr/palm/applications \
  /media/system/apps/usr/palm/applications \
  /usr/palm/applications \
  /mnt/otncabi/usr/palm/applications \
  /mnt/otycabi/usr/palm/applications
do
  [ -d "$base" ] || continue
  for manifest in "$base"/*/appinfo.json
  do
    [ -f "$manifest" ] || continue
    id=$(sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
    title=$(sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -n 1)
    printf '%s|%s|%s\n' "$id" "$title" "$base"
  done
done | sort -u | grep -Ei 'netflix|hbo|max|prime|amazon|movistar|youtube|disney'
