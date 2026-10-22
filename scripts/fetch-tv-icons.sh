#!/bin/sh
# Copia desde la TV los íconos oficiales de cada app a assets/logos/tv/ (no se suben al repositorio: son marcas de sus dueños).
# Después: npm run build && python scripts/make_ipk.py && sh scripts/tv-install.sh <ipk>
# Variables: TV_HOST (obligatoria), TV_KEY (clave SSH de root; por defecto ~/.ssh/id_ed25519).
set -eu
TV_HOST=${TV_HOST:?define TV_HOST con la IP de la TV, p. ej. TV_HOST=192.168.1.50}
TV_KEY=${TV_KEY:-$HOME/.ssh/id_ed25519}
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT=$HERE/assets/logos/tv
mkdir -p "$OUT"
BASE=/media/cryptofs/apps/usr/palm/applications
# clave de config.js : id de la app : archivo del ícono (largeIcon de su appinfo.json); ajustar si tu TV difiere
for entry in netflix:netflix:LARGE_APP_ICON.png max:com.wbd.stream:largeIcon.png prime:amazon:aiv_white_130x130.png \
  movistar:telefonica.argentina:largeIcon.png youtube:youtube.leanback.v4:yt_lg_130x130.png \
  disney:com.disney.disneyplus-prod:largeIcon.png apple-tv:com.apple.appletv.web:AppleTV_130x130.png spotify:spotify-beehive:largeIcon.png; do
  key=${entry%%:*}; rest=${entry#*:}; id=${rest%%:*}; file=${rest#*:}
  if scp -O -q -i "$TV_KEY" -o BatchMode=yes "root@$TV_HOST:$BASE/$id/$file" "$OUT/$key.png"; then echo "ok  $key"; else echo "falta $key ($id/$file)"; fi
done
