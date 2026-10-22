#!/bin/sh
# Instala (o revierte, con un .ipk anterior) Mi pantalla en la TV y comprueba que root, debloat y autostart
# siguen igual. Solo toca com.fidexo.photolauncher. Uso: scripts/tv-install.sh artifacts/com.fidexo.photolauncher_X_all.ipk
# Variables: TV_HOST (obligatoria: IP de la TV), TV_KEY (clave SSH de root; por defecto ~/.ssh/id_ed25519). Reversión: ejecutarlo con el .ipk anterior
# (bajar de versión no está probado en esta TV: si la versión no cambia, el script avisa y no insiste).
set -eu
IPK=${1:?falta el .ipk}
TV_HOST=${TV_HOST:?define TV_HOST con la IP de la TV, p. ej. TV_HOST=192.168.1.50}
TV_KEY=${TV_KEY:-$HOME/.ssh/id_ed25519}
ID=com.fidexo.photolauncher
NAME=$(basename "$IPK")
case "$NAME" in ${ID}_*_all.ipk) ;; *) echo "No es un .ipk de $ID" >&2; exit 1 ;; esac
VERSION=${NAME#${ID}_}; VERSION=${VERSION%_all.ipk}
SSH="ssh -i $TV_KEY -o BatchMode=yes root@$TV_HOST"
LOCAL_MD5=$(md5sum "$IPK" | cut -d' ' -f1)

scp -O -i "$TV_KEY" -o BatchMode=yes "$IPK" "root@$TV_HOST:/tmp/$NAME"
$SSH "
set -u
[ \"\$(md5sum /tmp/$NAME | cut -d' ' -f1)\" = $LOCAL_MD5 ] || { echo 'md5 distinto tras subir'; exit 1; }
BEFORE=\$(md5sum /var/lib/webosbrew/init.d/* /var/lib/mipantalla-autostart/* | md5sum)
luna-send -i -f luna://com.webos.appInstallService/dev/install '{\"id\":\"testing\",\"ipkUrl\":\"/tmp/$NAME\",\"subscribe\":true}' >/tmp/mp-install.log 2>&1 &
P=\$!; i=0
while [ \$i -lt 60 ]; do sleep 2; i=\$((i+1)); grep -q '\"state\": \"installed\"\|FAILED\|\"returnValue\": false' /tmp/mp-install.log && break; done
kill \$P 2>/dev/null
grep state /tmp/mp-install.log | tail -2
AFTER=\$(md5sum /var/lib/webosbrew/init.d/* /var/lib/mipantalla-autostart/* | md5sum)
GOT=\$(sed -n 's/.*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p' /media/developer/apps/usr/palm/applications/$ID/appinfo.json | head -n 1)
rm -f /tmp/$NAME /tmp/mp-install.log
echo \"version en la TV: \$GOT (esperada $VERSION)\"
[ \"\$BEFORE\" = \"\$AFTER\" ] && echo 'hooks y autostart: sin cambios' || echo 'AVISO: cambiaron hooks/autostart'
[ \"\$GOT\" = $VERSION ]
"
