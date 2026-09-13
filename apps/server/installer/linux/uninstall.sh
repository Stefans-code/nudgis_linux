#!/usr/bin/env bash
# Disinstalla Nugis (Linux/systemd). Ferma e rimuove il servizio, rimuove i file
# installati. Per default NON tocca .env/nugis.db (i tuoi dati) a meno di --purge.
#
# Uso:
#   sudo /opt/nugis/uninstall.sh            # rimuove binario+servizio, conserva DB/.env
#   sudo /opt/nugis/uninstall.sh --purge    # rimuove ANCHE database e configurazione

set -euo pipefail

NUGIS_DIR="${NUGIS_DIR:-/opt/nugis}"
NUGIS_USER="${NUGIS_USER:-nugis}"
SERVICE_NAME="nugis"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui come root: sudo $0" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
  echo "==> Fermo e disabilito il servizio"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
fi

if [ "$PURGE" -eq 1 ]; then
  echo "==> Rimuovo TUTTO, incluso il database ($NUGIS_DIR)"
  rm -rf "$NUGIS_DIR"
else
  echo "==> Rimuovo binario e risorse, CONSERVO .env e nugis.db in $NUGIS_DIR"
  rm -f "$NUGIS_DIR/Nugis"
  rm -rf "$NUGIS_DIR/generated" "$NUGIS_DIR/prisma" "$NUGIS_DIR/public"
  echo "    (per rimuovere anche database/config: sudo $0 --purge)"
fi

if id "$NUGIS_USER" >/dev/null 2>&1; then
  userdel "$NUGIS_USER" 2>/dev/null || true
fi

echo "✅ Disinstallazione completata."
