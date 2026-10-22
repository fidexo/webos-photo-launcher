#!/bin/sh
# Bloqueo de dominios de publicidad/ACR de LG (ver scripts/tv/privacy/). Reversible en un comando.
#   scripts/tv-privacy.sh status | apply | remove
# apply: copia hosts-block.sh y blocklist.txt a /var/lib/mipantalla-privacy/, crea el hook 70-mipantalla-privacy
# en init.d de Homebrew Channel (para que vuelva a aplicarse al arrancar) y monta el /etc/hosts ampliado.
# remove: desmonta, borra el hook y la carpeta. No toca los hooks 50-debloat ni 60-mi-pantalla.
# Variables: TV_HOST (obligatoria: IP de la TV), TV_KEY (clave SSH de root; por defecto ~/.ssh/id_ed25519).
set -eu
TV_HOST=${TV_HOST:?define TV_HOST con la IP de la TV, p. ej. TV_HOST=192.168.1.50}
TV_KEY=${TV_KEY:-$HOME/.ssh/id_ed25519}
HERE=$(cd "$(dirname "$0")" && pwd)
SSH="ssh -i $TV_KEY -o BatchMode=yes root@$TV_HOST"
DIR=/var/lib/mipantalla-privacy
HOOK=/var/lib/webosbrew/init.d/70-mipantalla-privacy
case "${1:-status}" in
  apply)
    $SSH "mkdir -p $DIR && chmod 700 $DIR"
    scp -O -i "$TV_KEY" -o BatchMode=yes "$HERE/tv/privacy/hosts-block.sh" "$HERE/tv/privacy/blocklist.txt" "root@$TV_HOST:$DIR/"
    $SSH "chmod 700 $DIR/hosts-block.sh && sed -i 's/\r\$//' $DIR/hosts-block.sh $DIR/blocklist.txt
      printf '#!/bin/sh\nexec $DIR/hosts-block.sh apply >>/tmp/mipantalla-privacy.log 2>&1\n' >$HOOK && chmod 700 $HOOK
      $DIR/hosts-block.sh apply"
    ;;
  remove)
    $SSH "[ -x $DIR/hosts-block.sh ] && $DIR/hosts-block.sh remove; rm -f $HOOK; rm -rf $DIR; ls $HOOK $DIR 2>&1 | head -2"
    ;;
  status)
    $SSH "[ -x $DIR/hosts-block.sh ] && $DIR/hosts-block.sh status || echo 'no instalado'; ls -l $HOOK 2>&1 | tail -1"
    ;;
  *) echo "uso: $0 status|apply|remove" >&2; exit 1 ;;
esac
