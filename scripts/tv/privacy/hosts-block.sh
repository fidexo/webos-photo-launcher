#!/bin/sh
# Bloquea dominios de publicidad/ACR de LG montando un /etc/hosts ampliado (bind mount). No mata procesos,
# no borra archivos, no toca DNS ni iptables. Revertir: "remove" (o reiniciar sin el hook).
#   hosts-block.sh apply | remove | status
DIR=$(cd "$(dirname "$0")" && pwd)
MARK='# mipantalla-privacy'
case "${1:-status}" in
  apply)
    if grep -qF "$MARK" /etc/hosts 2>/dev/null; then echo 'ya activo'; exit 0; fi
    if grep -q ' /etc/hosts ' /proc/mounts 2>/dev/null; then echo '/etc/hosts ya tiene otro montaje: no se toca'; exit 1; fi
    [ -f "$DIR/hosts.orig" ] || cp /etc/hosts "$DIR/hosts.orig" || exit 1
    { cat "$DIR/hosts.orig"; echo "$MARK"
      grep -v '^#' "$DIR/blocklist.txt" | while read -r d; do [ -n "$d" ] && { echo "0.0.0.0 $d"; echo ":: $d"; }; done
    } > "$DIR/hosts.new" || exit 1
    chmod 644 "$DIR/hosts.new"
    mount --bind "$DIR/hosts.new" /etc/hosts && echo "activo: $(grep -c '^0.0.0.0' /etc/hosts) dominios"
    ;;
  remove)
    if grep -qF "$MARK" /etc/hosts 2>/dev/null; then umount /etc/hosts 2>/dev/null || umount -l /etc/hosts; fi
    grep -qF "$MARK" /etc/hosts 2>/dev/null && { echo 'sigue activo'; exit 1; } || echo 'desactivado'
    ;;
  status)
    if grep -qF "$MARK" /etc/hosts 2>/dev/null; then echo "activo: $(grep -c '^0.0.0.0' /etc/hosts) dominios"; else echo 'inactivo'; fi
    ;;
esac
