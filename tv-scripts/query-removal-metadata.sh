#!/bin/sh
for id in \
  clarovideo.dla.1 \
  com.directvgo.webostv-rt \
  com.disney.alch.prod.lrd.app \
  com.plutotv.app \
  flow \
  googleplaymovieswebos \
  karaokesmart \
  kocowa.app-1.19201 \
  lgchannels.home \
  tv.twitch.tv.starshot.lg
do
  file="/media/cryptofs/apps/usr/palm/applications/$id/appinfo.json"
  [ -f "$file" ] || { printf '%s|ABSENT\n' "$id"; continue; }
  type=$(sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1)
  internal=$(grep -o '"internalInstallationOnly"[[:space:]]*:[[:space:]]*[^,}]*' "$file" | head -n 1)
  removable=$(grep -o '"removable"[[:space:]]*:[[:space:]]*[^,}]*' "$file" | head -n 1)
  printf '%s|type=%s|%s|%s\n' "$id" "$type" "$internal" "$removable"
done
