# Se ejecuta EN la TV (lo lanza scripts/tv-install.sh con APP=<carpeta de la app instalada>): copia a la app el ícono oficial
# de cada app desde su propia carpeta de sistema. Nada de esto vive en el repositorio ni en el paquete (son marcas de sus dueños).
# Formato: clave de config.js, id de la app.
MAP='netflix netflix
max com.wbd.stream
prime amazon
movistar telefonica.argentina
youtube youtube.leanback.v4
disney com.disney.disneyplus-prod
apple-tv com.apple.appletv.web
spotify spotify-beehive'
OUT=$APP/assets/logos/tv
mkdir -p "$OUT" || exit 1
echo "$MAP" | while read -r key id; do
  done_one=0
  for base in /media/cryptofs/apps/usr/palm/applications /media/developer/apps/usr/palm/applications /usr/palm/applications; do
    dir=$base/$id
    [ -f "$dir/appinfo.json" ] || continue
    for field in largeIcon icon; do
      name=$(sed -n "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$dir/appinfo.json" | head -n 1)
      case "$name" in ''|*..*) continue ;; esac
      if [ -f "$dir/$name" ] && cp "$dir/$name" "$OUT/$key.png"; then echo "icono ok: $key"; done_one=1; break; fi
    done
    [ "$done_one" = 1 ] && break
  done
  [ "$done_one" = 1 ] || echo "sin icono: $key ($id no está instalada o no trae ícono)"
done
