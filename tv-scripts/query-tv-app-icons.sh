#!/bin/sh
for id in netflix com.wbd.stream amazon telefonica.argentina youtube.leanback.v4 com.disney.disneyplus-prod; do
  echo "===$id==="
  find /media/cryptofs/apps/usr/palm/applications /usr/palm/applications -path "*/$id/*" \( -iname '*.png' -o -iname '*.svg' \) 2>/dev/null | head -20
done
