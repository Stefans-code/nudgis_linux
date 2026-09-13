#!/usr/bin/env bash
# OPZIONALE — l'AppImage funziona benissimo senza questo script, lanciandola a mano
# ogni volta (./nugis-x86_64.AppImage). Questo script registra un servizio systemd
# --user (NON root, NON systemd di sistema) che la avvia da sola al login e la
# riavvia se crasha — utile se vuoi che Nugis giri sempre in background senza
# doverla lanciare a mano ogni volta.
#
# Uso:
#   ./install-autostart.sh /percorso/assoluto/nugis-x86_64.AppImage
#
# Per farla partire anche PRIMA del login (es. su un server headless che si riavvia
# da solo), serve in più (una tantum, richiede privilegi):
#   sudo loginctl enable-linger "$USER"

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APPIMAGE_PATH="${1:-}"
if [ -z "$APPIMAGE_PATH" ] || [ ! -f "$APPIMAGE_PATH" ]; then
  echo "Uso: $0 /percorso/assoluto/nugis-x86_64.AppImage" >&2
  exit 1
fi
APPIMAGE_PATH="$(readlink -f "$APPIMAGE_PATH")"
chmod +x "$APPIMAGE_PATH"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd non trovato: avvia Nugis a mano ($APPIMAGE_PATH), l'autostart non è disponibile su questo sistema." >&2
  exit 1
fi

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
sed "s|__APPIMAGE_PATH__|$APPIMAGE_PATH|g" "$HERE/nugis-appimage.service.template" > "$UNIT_DIR/nugis.service"

systemctl --user daemon-reload
systemctl --user enable --now nugis

echo "✅ Avvio automatico registrato (utente $(whoami))."
echo "   Log:      journalctl --user -u nugis -f"
echo "   Stato:    systemctl --user status nugis"
echo "   Rimuovi:  systemctl --user disable --now nugis && rm $UNIT_DIR/nugis.service"
echo
echo "Per farla partire anche senza una sessione utente attiva (es. server headless):"
echo "   sudo loginctl enable-linger \"$(whoami)\""
