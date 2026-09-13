# Guida rapida — Installare e avviare Nugis

Questa guida è per chi deve solo **installare e usare** Nugis, senza toccare codice.
Per problemi/errori vedi [`guida-tecnica-troubleshooting.md`](./guida-tecnica-troubleshooting.md).

Nugis è un unico programma che fa partire insieme: l'API, i bot Telegram delle
creator, e il pannello di gestione (accessibile da browser). Una volta installato,
resta acceso da solo e riparte da solo se il PC/server si riavvia — non c'è nulla da
lanciare a mano ogni volta.

## 1. Scegli il tuo sistema operativo

| Sistema | File da usare | Richiede |
|---|---|---|
| Windows 10/11 | `NugisSetup.exe` | Nulla di speciale, doppio clic |
| Linux (Ubuntu, Debian, Fedora, Arch, ecc.) | `nugis-x86_64.AppImage` o `nugis-aarch64.AppImage` | Nulla — `chmod +x` e via, nessun root/systemd obbligatorio |
| macOS (Intel o Apple Silicon) | `nugis-macos-universal.tar.gz` (o `NugisInstaller.pkg`) | Terminale + `sudo` (il `.pkg` è doppio clic) |

Su Linux scegli il file in base al processore: `x86_64` per PC/server normali,
`aarch64` per ARM (Raspberry Pi, server ARM, ecc. — `uname -m` te lo dice). Su macOS
un solo file per Intel e Apple Silicon: sceglie da solo il binario giusto durante
l'installazione.

## 2. Windows

1. Copia `NugisSetup.exe` sul PC, fai doppio clic.
2. Se Windows mostra "Windows ha protetto il PC" (SmartScreen): è normale, il
   programma non è ancora firmato digitalmente — clicca "Ulteriori informazioni" →
   "Esegui comunque". Non è un virus, è solo perché manca un certificato a pagamento
   (vedi guida tecnica).
3. Segui il wizard: cartella di installazione, **email e password admin** (login del
   pannello — scegline una vera, la userai ogni volta), poi la pagina "Licenza" —
   **lasciala vuota** se è un uso interno/di prova, compilala solo se hai ricevuto una
   chiave da chi vende Nugis.
4. Alla fine si apre da solo il browser su `http://localhost:4000`. Accedi con
   l'email/password appena scelte.

## 3. Linux (AppImage — nessuna installazione)

```bash
chmod +x nugis-x86_64.AppImage      # o nugis-aarch64.AppImage
./nugis-x86_64.AppImage
```

Al primo avvio ti chiede (da terminale) email e password admin, poi crea la sua
configurazione in una cartella `nugis-data/` accanto al file `.AppImage` (lì restano
anche il database e i backup — se sposti/aggiorni l'AppImage, sposta anche questa
cartella). Apri `http://localhost:4000` dal browser. Finché il terminale resta aperto
il programma resta acceso; chiudendolo (Ctrl+C) si ferma.

**Vuoi che resti sempre acceso in background, anche a terminale chiuso?** Serve
systemd (praticamente ogni distro moderna): scarica anche `install-autostart.sh` (o
prendilo dal repository, cartella `installer/linux-appimage/`) e lancia:

```bash
./install-autostart.sh "$(pwd)/nugis-x86_64.AppImage"
```

Comandi utili dopo:

```bash
systemctl --user status nugis           # è acceso?
journalctl --user -u nugis -f           # log in tempo reale
systemctl --user restart nugis          # riavvia
systemctl --user disable --now nugis    # disattiva l'avvio automatico
```

Per farlo partire anche prima del login (server headless che si riavvia da solo),
una tantum: `sudo loginctl enable-linger "$USER"`.

### In alternativa: un vero servizio di sistema (root, systemd)

Se preferisci un servizio installato "sul serio" (Program Files-style, un utente di
sistema dedicato) invece del formato AppImage portabile, è disponibile anche
`nugis-linux-universal.tar.gz` con `sudo ./install.sh` — stesso risultato finale, più
simile all'installer Windows. Vedi la guida tecnica per i dettagli.

## 4. macOS

**Opzione A — da terminale (consigliata, uguale a Linux):**

```bash
tar -xzf nugis-macos-universal.tar.gz
cd nugis-macos-universal
sudo ./install.sh
```

Se macOS blocca l'esecuzione ("sviluppatore non verificato"): Preferenze di Sistema →
Privacy e Sicurezza → in fondo trovi il pulsante per consentirlo comunque, oppure
click destro sul file → Apri.

**Opzione B — doppio clic su `NugisInstaller.pkg`:** più semplice ma senza pagina per
scegliere email/password — al primo avvio ti genera una password provvisoria. Dopo
l'installazione, apri il file
`sudo cat /usr/local/nugis/CREDENZIALI_INIZIALI.txt` per leggerla, fai login su
`http://localhost:4000`, **cambiala subito** e poi cancella quel file.

Comandi utili dopo l'installazione:

```bash
tail -f /usr/local/nugis/nugis.log             # log in tempo reale
sudo launchctl kickstart -k system/com.nugis.app  # riavvia
sudo /usr/local/nugis/uninstall.sh              # disinstalla (conserva i dati)
```

## 5. Primo utilizzo (uguale su tutti i sistemi)

1. Accedi su `http://localhost:4000` con le credenziali admin.
2. Crea una **creator** dal pannello.
3. Su Telegram, apri **@BotFather**, `/newbot`, copia il **token** (formato
   `123456789:ABC-DEF...`).
4. Incolla il token nella scheda della creator ("Persona & AI Settings") e salva: il
   bot di quella creator parte da solo, subito.
5. Il **motore AI di default è Ollama in locale** — se non lo hai installato/avviato
   sulla stessa macchina, il bot non genererà risposte finché non imposti un altro
   provider (o installi Ollama) dalla scheda della creator. Vedi la guida tecnica,
   sezione "Il bot non risponde in chat".

## 6. Disinstallare

Ogni piattaforma conserva **per default** database e configurazione quando
disinstalli — nessun dato viene perso "per sbaglio". Per cancellare anche quelli:

- Linux (AppImage): cancella il file `.AppImage` e la cartella `nugis-data/` accanto ad esso (e, se avevi attivato l'avvio automatico: `systemctl --user disable --now nugis`)
- Linux (installer tradizionale): `sudo /opt/nugis/uninstall.sh --purge`
- macOS: `sudo /usr/local/nugis/uninstall.sh --purge`
- Windows: dal Pannello di controllo, "Disinstalla Nugis" (rimuove sempre tutto,
  incluso il database — su Windows non esiste ancora l'opzione "conserva i dati")
