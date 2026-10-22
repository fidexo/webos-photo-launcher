#!/bin/sh
# Qué abre el botón Home del control: Mi pantalla o el inicio original de LG. No instala ni borra nada.
#   scripts/tv-home.sh status    muestra el destino actual
#   scripts/tv-home.sh mipantalla  Home -> Mi pantalla (guarda antes el valor anterior en la TV)
#   scripts/tv-home.sh lg          Home -> inicio original de LG (com.webos.app.fullhome)
# Variables: TV_HOST (obligatoria: IP de la TV), TV_KEY (clave SSH de root; por defecto ~/.ssh/id_ed25519).
set -eu
TV_HOST=${TV_HOST:?define TV_HOST con la IP de la TV, p. ej. TV_HOST=192.168.1.50}
TV_KEY=${TV_KEY:-$HOME/.ssh/id_ed25519}
case "${1:-status}" in
  status) TARGET= ;;
  mipantalla) TARGET=com.fidexo.photolauncher ;;
  lg) TARGET=com.webos.app.fullhome ;;
  *) echo "uso: $0 status|mipantalla|lg" >&2; exit 1 ;;
esac
ssh -i "$TV_KEY" -o BatchMode=yes "root@$TV_HOST" "
call() { luna-send -i -f luna://com.webos.settingsservice/\$1 \"\$2\" >/tmp/h.log 2>&1 & P=\$!; sleep 3; kill \$P 2>/dev/null; cat /tmp/h.log; }
current() { call getSystemSettings '{\"category\":\"general\",\"keys\":[\"defaultApps\"]}' | sed -n 's/.*\"home\": \"\([^\"]*\)\".*/\1/p'; }
BEFORE=\$(current); echo \"Home abre ahora: \$BEFORE\"
[ -n '$TARGET' ] || exit 0
[ \"\$BEFORE\" = '$TARGET' ] && { echo 'ya estaba así'; exit 0; }
[ '$TARGET' = com.fidexo.photolauncher ] && { [ -f /media/developer/apps/usr/palm/applications/com.fidexo.photolauncher/appinfo.json ] || { echo 'Mi pantalla no está instalada'; exit 1; }; mkdir -p /var/lib/mipantalla-maintenance; [ -f /var/lib/mipantalla-maintenance/home-before ] || echo \"\$BEFORE\" >/var/lib/mipantalla-maintenance/home-before; }
call setSystemSettings '{\"category\":\"general\",\"settings\":{\"defaultApps\":{\"home\":\"$TARGET\"}}}' | grep returnValue
AFTER=\$(current); echo \"Home abre ahora: \$AFTER\"; [ \"\$AFTER\" = '$TARGET' ]
"
