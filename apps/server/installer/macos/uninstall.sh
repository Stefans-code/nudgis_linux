#!/usr/bin/env bash
# Disinstalla Nugis (macOS). Ferma e rimuove il LaunchDaemon, rimuove i file installati.
# Per default NON tocca .env/nugis.db a meno di --purge.
#
# Uso:
#   sudo /usr/local/nugis/uninstall.sh
#   sudo /usr/local/nugis/uninstall.sh --purge   # rimuove ANCHE database e configurazione

set -euo pipefail

NUGIS_DIR="${NUGIS_DIR:-/usr/local/nugis}"
PLIST_PATH="/Library/LaunchDaemons/com.nugis.app.plist"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui come root: sudo $0" >&2
  exit 1
fi

if [ -f "$PLIST_PATH" ]; then
  echo "==> Fermo e rimuovo il LaunchDaemon"
  launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
fi

if [ "$PURGE" -eq 1 ]; then
  echo "==> Rimuovo TUTTO, incluso il database ($NUGIS_DIR)"
  rm -rf "$NUGIS_DIR"
else
  echo "==> Rimuovo binario e risorse, CONSERVO .env e nugis.db in $NUGIS_DIR"
  rm -f "$NUGIS_DIR/Nugis" "$NUGIS_DIR/nugis.log"
  rm -rf "$NUGIS_DIR/generated" "$NUGIS_DIR/prisma" "$NUGIS_DIR/public"
  echo "    (per rimuovere anche database/config: sudo $0 --purge)"
fi

echo "✅ Disinstallazione completata."
