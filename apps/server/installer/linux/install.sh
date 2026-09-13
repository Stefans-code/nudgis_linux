#!/usr/bin/env bash
# Installer Linux di Nugis (systemd). Va eseguito come root (sudo) dalla cartella
# estratta dal tarball nugis-linux-<arch>.tar.gz — si aspetta di trovare accanto a sé
# il binario "Nugis" e le cartelle generated/, prisma/, public/.
#
# Cosa fa, in ordine (equivalente Linux del wizard NugisSetup.exe su Windows):
#   1. Copia i file in /opt/nugis (o $NUGIS_DIR se impostata)
#   2. Crea un utente di sistema dedicato "nugis" (nessuna home, nessuna shell di login)
#   3. Genera .env con segreti casuali reali (openssl/urandom, non prevedibili) e le
#      credenziali admin che fornisci (a prompt, oppure da variabili d'ambiente per
#      installazioni automatiche/scriptate)
#   4. Installa e avvia un servizio systemd che parte da solo al boot e riparte da solo
#      dopo un crash — copertura: qualunque distro con systemd (Debian/Ubuntu, Fedora/
#      RHEL/Rocky/Alma, openSUSE, Arch, Mint, ecc. — la stragrande maggioranza delle
#      distro Linux in uso oggi). Su una distro SENZA systemd (es. Alpine di default,
#      Devuan, container minimal) il binario funziona comunque lanciato a mano
#      (vedi "Avvio manuale" più sotto), ma il servizio automatico non viene installato.
#
# Uso interattivo:
#   sudo ./install.sh
# Uso non interattivo (es. provisioning automatico):
#   sudo NUGIS_ADMIN_EMAIL=admin@esempio.it NUGIS_ADMIN_PASSWORD='almeno8caratteri' ./install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NUGIS_DIR="${NUGIS_DIR:-/opt/nugis}"
NUGIS_USER="${NUGIS_USER:-nugis}"
SERVICE_NAME="nugis"

# --- 0. Controlli preliminari -------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  echo "Questo installer deve girare come root: usa 'sudo ./install.sh'." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/Nugis" ]; then
  echo "Non trovo '$SCRIPT_DIR/Nugis'. Esegui questo script dalla cartella estratta dal tarball, non da un'altra posizione." >&2
  exit 1
fi

HAS_SYSTEMD=1
if ! command -v systemctl >/dev/null 2>&1 || [ ! -d /run/systemd/system ]; then
  HAS_SYSTEMD=0
  echo "⚠️  systemd non rilevato su questa macchina: i file verranno comunque installati," >&2
  echo "   ma NON verrà creato nessun servizio di avvio automatico. Dovrai avviare Nugis" >&2
  echo "   a mano (vedi il messaggio finale) o integrarlo nel tuo init system." >&2
fi

# --- 1. Copia dei file ---------------------------------------------------------------
echo "==> Copio i file in $NUGIS_DIR"
mkdir -p "$NUGIS_DIR"
cp -a "$SCRIPT_DIR/Nugis" "$NUGIS_DIR/Nugis"
chmod 755 "$NUGIS_DIR/Nugis"
for d in generated prisma public; do
  rm -rf "${NUGIS_DIR:?}/$d"
  cp -a "$SCRIPT_DIR/$d" "$NUGIS_DIR/$d"
done
[ -f "$SCRIPT_DIR/.env.example" ] && cp -a "$SCRIPT_DIR/.env.example" "$NUGIS_DIR/.env.example"

# --- 2. Utente di sistema dedicato -----------------------------------------------------
if ! id "$NUGIS_USER" >/dev/null 2>&1; then
  echo "==> Creo l'utente di sistema '$NUGIS_USER'"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$NUGIS_USER" 2>/dev/null \
    || useradd --system --no-create-home --shell /sbin/nologin "$NUGIS_USER"
fi

# --- 3. Genera .env (solo se non esiste già: un rerun dell'installer non deve --------
#        distruggere una configurazione esistente) -----------------------------------
ENV_FILE="$NUGIS_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  echo "==> $ENV_FILE esiste già, non lo tocco (rerun dell'installer)."
else
  gen_secret() {
    if command -v openssl >/dev/null 2>&1; then
      openssl rand -base64 48
    else
      # Fallback se openssl non è disponibile: /dev/urandom + base64 è comunque un RNG
      # crittografico del kernel, non un generatore debole.
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
# Generato automaticamente dall'installer Nugis il $(date -Iseconds). Modifica solo se sai cosa stai facendo.
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

chown -R "$NUGIS_USER:$NUGIS_USER" "$NUGIS_DIR"

# --- 4. Servizio systemd ---------------------------------------------------------------
if [ "$HAS_SYSTEMD" -eq 1 ]; then
  echo "==> Installo il servizio systemd '$SERVICE_NAME'"
  sed -e "s|__NUGIS_DIR__|$NUGIS_DIR|g" -e "s|__NUGIS_USER__|$NUGIS_USER|g" \
    "$SCRIPT_DIR/nugis.service.template" > "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
  sleep 2
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo
    echo "✅ Nugis è installato e attivo: http://localhost:4000"
    echo "   Log:            journalctl -u $SERVICE_NAME -f"
    echo "   Stato:          systemctl status $SERVICE_NAME"
    echo "   Riavvio:        systemctl restart $SERVICE_NAME"
    echo "   Disinstalla:    sudo $NUGIS_DIR/uninstall.sh   (o lo script accanto al tarball)"
  else
    echo
    echo "⚠️  Il servizio è installato ma non risulta attivo. Controlla i log:" >&2
    echo "   journalctl -u $SERVICE_NAME -e --no-pager" >&2
    exit 1
  fi
else
  echo
  echo "✅ File installati in $NUGIS_DIR. Avvio manuale (nessun systemd rilevato):"
  echo "   sudo -u $NUGIS_USER $NUGIS_DIR/Nugis"
fi

cp -a "$SCRIPT_DIR/uninstall.sh" "$NUGIS_DIR/uninstall.sh" 2>/dev/null || true
chmod 755 "$NUGIS_DIR/uninstall.sh" 2>/dev/null || true
