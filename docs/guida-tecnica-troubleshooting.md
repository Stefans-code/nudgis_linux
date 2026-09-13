# Guida tecnica e troubleshooting — Nugis

Riferimento unico per chi gestisce/sviluppa Nugis: ogni bug noto, limite conosciuto o
scelta architetturale rilevante, con causa e soluzione. Aggiornata al 13/09/2026.
Per l'uso base vedi [`guida-cliente.md`](./guida-cliente.md).

Legenda stato: ✅ risolto e verificato dal vivo · ⚠️ noto, non ancora testato/risolto ·
🧪 risolto ma verificato solo in CI/automatico, non su una macchina reale del cliente.

---

## 1. Installazione — Windows

| Problema | Causa | Soluzione |
|---|---|---|
| SmartScreen: "Windows ha protetto il PC" | `NugisSetup.exe`/`Nugis.exe` non firmati digitalmente (nessun certificato Authenticode, 70-300€/anno) | "Ulteriori informazioni" → "Esegui comunque". Per toglierlo del tutto serve comprare un certificato di code-signing |
| Il wizard non è mai stato eseguito per davvero | Richiede di modificare Program Files + registrare un task SYSTEM sulla macchina di sviluppo — non fatto senza conferma esplicita (vedi `docs/installer.md`) | ⚠️ **Va testato almeno una volta su una macchina/VM pulita prima di consegnarlo a un cliente vero** |
| Il bot non parte dopo un riavvio del PC | L'attività pianificata (`schtasks /SC ONSTART`) non è partita, o `Nugis.exe` crasha subito | Apri "Utilità di pianificazione" di Windows → cerca il task "Nugis" → guarda l'ultimo risultato di esecuzione. Prova ad avviare `Nugis.exe` a mano dalla cartella d'installazione per vedere l'errore in chiaro |
| Dopo la disinstallazione i dati sono spariti | Su Windows l'uninstaller rimuove **sempre tutto**, incluso il DB — non esiste ancora l'opzione "conserva dati" come su Linux/macOS | Prima di disinstallare, backup manuale di `<cartella installazione>\nugis.db` |

## 2. Installazione — Linux

| Problema | Causa | Soluzione |
|---|---|---|
| "systemd non rilevato" durante `install.sh` | Distro senza systemd (Alpine di default, Devuan, alcuni container minimal) | I file vengono comunque installati; avvia a mano: `sudo -u nugis /opt/nugis/Nugis`, oppure integralo nel tuo init system (OpenRC, runit, ecc.) |
| Il servizio non risponde su :4000 dopo l'installazione | 1) porta già occupata da un altro processo — 2) crash immediato del binario | `sudo journalctl -u nugis -e --no-pager` mostra l'errore reale. Per la porta: `sudo ss -ltnp \| grep 4000` |
| `install.sh` fallisce su `useradd` | Alcune distro minimal non hanno `useradd`/`shadow-utils` di default | Installa il pacchetto `shadow`/`shadow-utils` della tua distro, poi rilancia |
| "Architettura non riconosciuta" durante `install.sh` | `uname -m` ha restituito qualcosa di diverso da `x86_64`/`aarch64`/`arm64` (es. `armv7l` a 32 bit, `riscv64`, ecc.) | Non supportato: Nugis builda solo per x64 e arm64 a 64 bit (vedi `binaryTargets` in `prisma/schema.prisma` e i target pkg in `scripts/build-installer-linux.js`) |
| Serve una distro non coperta (Alpine/musl) | Il motore Prisma per `linux-musl`/`linux-musl-arm64-openssl-3.0.x` **è incluso** nel bundle (vedi `binaryTargets` in `prisma/schema.prisma`), ma il binario `Nugis` stesso è compilato per glibc | ⚠️ Non testato su Alpine: se serve davvero, va ricompilato un target pkg specifico per musl (pkg non lo builda di default) |

## 3. Installazione — macOS

| Problema | Causa | Soluzione |
|---|---|---|
| Gatekeeper: "sviluppatore non verificato" | Nessuna firma Apple Developer ID / notarizzazione (a pagamento) | Preferenze di Sistema → Privacy e Sicurezza → "Consenti comunque", oppure click destro → Apri |
| 🧪→✅ Provato un vero binario universale con `lipo -create`: CRASHA all'avvio ("SyntaxError: Invalid or unexpected token" + caratteri CJK a caso nel log) | **Scoperto e capito il 13/09/2026**: `pkg` aggiunge dopo il Mach-O un payload custom (bootstrap + snapshot V8) con offset che puntano alla posizione ORIGINALE nel file. `lipo` sposta le due fette dentro un fat-file più grande ma non riscrive quegli offset — il binario compila e passa `lipo -info`, ma legge byte a caso come se fossero JavaScript | **Non usare `lipo` con binari `pkg`.** Nugis distribuisce invece un pacchetto unico con ENTRAMBI i binari (`Nugis-x64`, `Nugis-arm64`) e `install.sh`/`postinstall` scelgono quello giusto in base a `uname -m` — un solo download, funziona ovunque, senza il rischio del fat-binary rotto |
| 🧪 (storico, capostipite del bug sopra) Il LaunchDaemon risultava caricato ma il pannello non rispondeva MAI | Prima ancora del problema lipo: il bundle copiava `generated/prisma-client` SOLO dalla build x64 (dopo il filtro per-piattaforma, solo motore `darwin-x64`) — su Apple Silicon mancava `libquery_engine-darwin-arm64.dylib.node` | ✅ Il pacchetto attuale unisce i motori di ENTRAMBE le build. In generale: `tail -f /usr/local/nugis/nugis.log` mostra sempre l'errore reale, anche quando `launchctl print` dice "caricato" (loaded ≠ vivo/funzionante) |
| Il `.pkg` installa con una password a caso | Scelta voluta: un `.pkg` a doppio clic non ha un vero prompt di testo per email/password, a differenza del wizard Windows o di `install.sh` a terminale | Leggi `/usr/local/nugis/CREDENZIALI_INIZIALI.txt`, fai login, cambia subito le credenziali, cancella il file |
| Build del pacchetto (`build:installer:macos`) fallisce su Windows/Linux | Lo script richiede `pkgbuild`, tool che esiste SOLO su macOS | Va eseguito su un Mac reale, o lasciato al workflow CI `.github/workflows/build-macos-installer.yml` (runner `macos-latest`) |
| Build di `node22-macos-arm64` (o x64) fallisce con "spawn UNKNOWN" | pkg deve "fabbricare" il binario della arch target eseguendolo — impossibile cross-arch senza Rosetta/QEMU | Builda su un Mac Apple Silicon con Rosetta installata (gestisce sia arm64 nativo che x64 emulato) o lascia fare alla CI, che verifica ENTRAMBI i binari per davvero (uno nativo, uno via Rosetta) prima di pubblicarli |

## 4. Motore AI / risposte del bot

| Problema | Causa | Soluzione |
|---|---|---|
| Il bot non risponde per niente in chat | Nessun provider LLM raggiungibile per quella creator (default: Ollama locale, non installato) | Installa Ollama sulla stessa macchina (`ollama pull llama3.2` o un modello migliore) **oppure** imposta un altro provider dalla scheda "Persona & AI Settings" della creator |
| Risposte di bassa qualità/incoerenti in sexchat | Con Ollama, la qualità dipende MOLTO dal modello scaricato — un modello piccolo (es. `llama3.2:3b`, ~2GB) è stato usato solo per testare velocemente la pipeline con una connessione lenta, non è la scelta consigliata per produzione | Scarica un modello più capace (`llama3.1:8b` o meglio, se la macchina/connessione lo permette) |
| Vuoi usare OpenAI/Anthropic/DeepSeek per il contenuto esplicito | **Non farlo**: i ToS di tutti e tre vietano contenuto sessualmente esplicito via API in praticamente ogni contesto commerciale — rischio concreto di sospensione della chiave quando il traffico cresce | Resta su Ollama (locale, nessuna restrizione sui contenuti) o un provider di terze parti pensato apposta per NSFW/roleplay. Vedi `architettura-roadmap.md` |
| Serve un provider "ufficiale" solo per small talk/follow-up | Fattibile: il sistema è già per-creator, un provider diverso per parti non esplicite del flusso è supportato impostandolo dalla scheda creator | — |

## 5. Telegram

| Problema | Causa | Soluzione |
|---|---|---|
| ⚠️ Le "cartelle Telegram reali" (MTProto) non hanno mai funzionato | **Mai testate con un account Telegram reale** — richiedono un numero di telefono vero + SMS OTP, non simulabile in sviluppo | Va provato dal vivo con un account reale (anche secondario) prima di fidarsene in produzione. Il tag interno `Fan.folderTag` resta un fallback sempre funzionante |
| Il bot smette di rispondere / account limitato da Telegram | Troppi messaggi identici a molti utenti in poco tempo (pattern anti-spam non documentato ufficialmente da Telegram) | Rispettate i limiti prudenziali già applicati (tetto giornaliero, rotazione varianti, jitter) — vedi `docs/telegram-automation-limits.md`. Non alzarli senza motivo |
| Un fan non riceve più follow-up | Ha fatto opt-out esplicito (rilevato da parola chiave o dal LLM) | Comportamento corretto/voluto, non un bug — verificabile dal pannello |
| Serve un bot condiviso invece di uno per creator | Architettura attuale = un processo bot per creator (scelta esplicita del founder per il bug "sovraccarico") | Per un bot condiviso serve estendere la coda con prioritizzazione per creator — non implementato |

## 6. Pagamenti, licenza, dati

| Problema | Causa | Soluzione |
|---|---|---|
| Un incasso confermato non compare nella dashboard | Resta "pending" per il periodo configurato (default 21 giorni) prima di diventare "withdrawable" — comportamento voluto, replica lo screenshot del prodotto originale | Aspetta il periodo di pending, o cambia la configurazione se serve un periodo diverso |
| Il bot promette "controllo il pagamento" e poi non risponde più | Bug del prodotto ORIGINALE, già corretto: ogni dichiarazione di pagamento esterno crea un `ExternalPaymentClaim` tracciato, risolto sempre con un esito reale (confermato o non trovato) | Se ricapita, controlla la tab "Verifica Pagamenti" del pannello — la richiesta è lì, va risolta manualmente |
| Un'installazione venduta smette di funzionare | Il license-server non è raggiungibile da più di 5 giorni consecutivi (grace period scaduto), oppure la licenza è stata revocata/scaduta | Verifica che il license-server dell'ufficio sia acceso e raggiungibile; controlla stato/scadenza via `curl .../admin/licenses` |
| Serve gestire tante licenze comodamente | Nessuna UI per il license-server, solo API dirette (`curl`) — adeguato per un piccolo ufficio | Se il volume cresce, vale la pena costruire una piccola UI sopra le route già pronte |
| Una API key LLM è finita esposta in chiaro (es. screenshot, PDF, log) | Successo realmente una volta: una API key DeepSeek era visibile in chiaro in uno screenshot del brief cliente originale | **Ruota subito** qualunque chiave finita in un file/documento condiviso, anche se "solo interno" |

## 7. Dati, backup, GDPR

| Problema | Causa | Soluzione |
|---|---|---|
| ✅ Trovato e risolto 13/09/2026: `DATABASE_URL="file:./prisma/dev.db"` in `.env.example`/`.env` locale creava un `prisma/prisma/dev.db` annidato | Sia Prisma CLI che `resolveSqliteFilePath()` (vedi `src/lib/paths.ts`) risolvono un path relativo **rispetto alla cartella `prisma/`**, non alla root del progetto — stesso identico bug già corretto in passato in `apps/license-server` (vedi `docs/license-server.md`), qui non era ancora stato applicato | Corretto: valore ora `"file:./dev.db"` in entrambi i file; il DB reale (con tutti i dati/migrazioni) spostato da `prisma/prisma/dev.db` a `prisma/dev.db`, verificato byte-identico prima di rimuovere l'originale, e con `npx prisma migrate status` dopo lo spostamento (schema aggiornato, 13/13 migrazioni, zero perdita dati) |
| Ho backup automatici? | Sì, ogni notte alle 03:00, retention 7 giorni, nella cartella `backups/` accanto al file DB vero (non a `__dirname`, che nell'exe pacchettizzato è di sola lettura) | Nessuna copia offsite automatica — per un cliente vero, valuta di copiare periodicamente `backups/` altrove |
| Consegna on-premise a un cliente esterno (Docker o codice sorgente) | La libreria per le cartelle Telegram reali (`telegram`/GramJS) dipende da `@cryptography/aes`, **licenza GPL-3.0-or-later** | Non è un problema per SaaS (voi ospitate, il cliente usa solo il browser). **Lo è se distribuite il pacchetto Docker o il sorgente**: rischio di dover rilasciare il codice sorgente dell'intero prodotto. Non è consulenza legale — portalo a un avvocato prima di vendere on-prem. Opzioni pratiche: isolare il servizio MTProto in un componente non distribuito, o trovare un'alternativa senza questa dipendenza |
| Serve conformità GDPR completa | Fuori scope per un MVP interno con pochi utenti reali | Vedi `docs/gdpr-data-handling.md`; da affrontare seriamente solo prima di rivendere ad agenzie terze |

## 8. Deploy Docker (on-premise)

| Problema | Causa | Soluzione |
|---|---|---|
| Dopo `docker compose up -d --build` non c'è nessun admin | Il container applica le migrazioni Prisma da solo, ma **non seeda l'utente admin automaticamente** | `docker compose exec server npx prisma db seed` (una tantum) |
| `docker compose down -v` ha cancellato tutto | `-v` rimuove anche il volume `nugis_data` (il database) — va usato solo per ripartire da zero | Senza `-v`, `docker compose down` non tocca i dati |
| Building/deploy per un cliente esterno | Vedi la nota GPL-3.0 sopra (sezione 7) prima di consegnare il pacchetto | — |

## 9. Build e pipeline (per chi sviluppa)

| Problema | Causa | Soluzione |
|---|---|---|
| Un `.env` ha due righe con la stessa chiave e vince quella sbagliata | `dotenv` usa sempre la **prima occorrenza** in un file — un `>>` che aggiunge una riga sotto un valore già presente non la sovrascrive | Non appendere mai a un `.env` esistente: rigeneralo da zero o modifica la riga esistente |
| L'exe pacchettizzato (`pkg`) non trova il client Prisma / il motore nativo | `tsc` compila solo `.ts`, il client Prisma generato è già JS puro e viene ignorato — servito da `scripts/copy-generated-client.js` (build) e dalla copia esplicita in `scripts/build-exe.js` (pacchettizzazione) | Se manca, verifica di aver eseguito `npx prisma generate` prima della build |
| Un binario per una piattaforma diversa dalla propria non parte | Manca il motore Prisma per quel target (bug corretto 13/09/2026 aggiungendo `binaryTargets` in `prisma/schema.prisma`) — se rigeneri lo schema senza quei target, si ripresenta | Verifica che `prisma/schema.prisma` includa `binaryTargets` con tutte le piattaforme che ti servono, poi rilancia `npx prisma generate` |
| Build cross-arch di `pkg` fallisce ("spawn UNKNOWN"/"spawn ENOEXEC") | pkg per un'architettura CPU diversa da quella host deve "fabbricare" il binario eseguendolo — impossibile senza emulazione (QEMU/Rosetta) | Registra QEMU (`docker/setup-qemu-action`) solo per questo passaggio di build — funziona bene per FABBRICARE. Per macOS, Rosetta sullo stesso runner Apple Silicon copre anche questo caso |
| Il binario arm64 Linux non risponde/non produce errori se eseguito sotto QEMU "nudo" (fuori da Docker) | Scoperto 13/09/2026: l'emulazione QEMU registrata da `docker/setup-qemu-action` fabbrica bene i binari, ma eseguirli direttamente (non dentro un container Docker) si è dimostrato inaffidabile — il processo si blocca senza log né errore | Non provare a rendere affidabile l'esecuzione emulata: la CI testa l'arm64 su un runner nativo vero (`ubuntu-24.04-arm`, gratuito su GitHub Actions), non via emulazione — vedi job `test` in `build-linux-installer.yml` |
| L'exe/tarball è enorme | `pkg` include un intero runtime Node — normale, ridotto tenendo solo i motori Prisma rilevanti per il target (non più tutti e 8) | Nessuna azione necessaria, è già ottimizzato quanto ragionevole senza cambiare tool di packaging |
