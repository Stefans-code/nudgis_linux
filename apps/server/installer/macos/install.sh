#!/usr/bin/env bash
# Installer macOS di Nugis (LaunchDaemon), versione a riga di comando/interattiva —
# equivalente al wizard NugisSetup.exe di Windows. Va eseguito con sudo dalla cartella
# estratta dal tarball nugis-macos-universal.tar.gz.
#
# Uso:
#   sudo ./install.sh
# Uso non interattivo:
#   sudo NUGIS_ADMIN_EMAIL=admin@esempio.it NUGIS_ADMIN_PASSWORD='almeno8caratteri' ./install.sh
#
# Per chi preferisce un doppio-click invece del Terminale: vedi anche NugisInstaller.pkg
# (stesso contenuto, ma con password admin iniziale casuale da cambiare al primo
# accesso — leggi docs/installer-macos.md per i dettagli e i limiti di quella via).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NUGIS_DIR="${NUGIS_DIR:-/usr/local/nugis}"
PLIST_PATH="/Library/LaunchDaemons/com.nugis.app.plist"

if [ "$(id -u)" -ne 0 ]; then
  echo "Questo installer deve girare come root: usa 'sudo ./install.sh'." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/Nugis" ]; then
  echo "Non trovo '$SCRIPT_DIR/Nugis'. Esegui questo script dalla cartella estratta dal tarball." >&2
  exit 1
fi

echo "==> Copio i file in $NUGIS_DIR"
mkdir -p "$NUGIS_DIR"
cp -a "$SCRIPT_DIR/Nugis" "$NUGIS_DIR/Nugis"
chmod 755 "$NUGIS_DIR/Nugis"
for d in generated prisma public; do
  rm -rf "${NUGIS_DIR:?}/$d"
  cp -a "$SCRIPT_DIR/$d" "$NUGIS_DIR/$d"
done
[ -f "$SCRIPT_DIR/.env.example" ] && cp -a "$SCRIPT_DIR/.env.example" "$NUGIS_DIR/.env.example"

ENV_FILE="$NUGIS_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo "==> $ENV_FILE esiste già, non lo tocco (rerun dell'installer)."
else
  gen_secret() {
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -base64 48
    else
      head -c 48 /dev/urandom | base64
    fi
  }

  ADMIN_EMAIL="${NUGIS_ADMIN_EMAIL:-}"
  ADMIN_PASSWORD="${NUGIS_ADMIN_PASSWORD:-}"

  if [ -z "$ADMIN_EMAIL" ]; then
    read -r -p "Email amministratore (login al pannello): " ADMIN_EMAIL
  fi
  while [ -z "$ADMIN_PASSWORD" ] || [ "${#ADMIN_PASSWORD}" -lt 8 ]; do
    read -r -s -p "Password amministratore (minimo 8 caratteri): " ADMIN_PASSWORD
    echo
    if [ "${#ADMIN_PASSWORD}" -lt 8 ]; then
      echo "Troppo corta, servono almeno 8 caratteri." >&2
    fi
  done

  echo "==> Genero $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# Generato automaticamente dall'installer Nugis il $(date -Iseconds 2>/dev/null || date). Modifica solo se sai cosa stai facendo.
DATABASE_URL="file:$NUGIS_DIR/nugis.db"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_API_ID=""
TELEGRAM_API_HASH=""
ENCRYPTION_KEY="$(gen_secret)"
LLM_PROVIDER="ollama"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-5"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"
DEEPSEEK_API_KEY=""
ADMIN_JWT_SECRET="$(gen_secret)"
ADMIN_DEFAULT_EMAIL="$ADMIN_EMAIL"
ADMIN_DEFAULT_PASSWORD="$ADMIN_PASSWORD"
PORT=4000
WEB_ORIGIN="http://localhost:4000"
LICENSE_SERVER_URL=""
LICENSE_KEY=""
EOF
  chmod 600 "$ENV_FILE"
fi

echo "==> Installo il LaunchDaemon"
sed "s|__NUGIS_DIR__|$NUGIS_DIR|g" "$SCRIPT_DIR/nugis.plist.template" > "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

# bootout ignora l'errore se non era già caricato (rerun dell'installer)
launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap system "$PLIST_PATH"
launchctl enable "system/com.nugis.app"

sleep 2
if launchctl print "system/com.nugis.app" >/dev/null 2>&1; then
  echo
  echo "✅ Nugis è installato e attivo: http://localhost:4000"
  echo "   Log:            tail -f $NUGIS_DIR/nugis.log"
  echo "   Riavvio:        sudo launchctl kickstart -k system/com.nugis.app"
  echo "   Disinstalla:    sudo $NUGIS_DIR/uninstall.sh"
else
  echo "⚠️  Il LaunchDaemon non risulta caricato. Controlla $NUGIS_DIR/nugis.log" >&2
  exit 1
fi

cp -a "$SCRIPT_DIR/uninstall.sh" "$NUGIS_DIR/uninstall.sh" 2>/dev/null || true
chmod 755 "$NUGIS_DIR/uninstall.sh" 2>/dev/null || true
