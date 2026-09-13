# Nugis

Chatbot Telegram per la gestione multi-creator di vendita contenuti, con backend (bot
Telegram + API admin) e pannello web di gestione.

## Cosa fa

- Bot Telegram per creator, con risposte generate da un LLM (DeepSeek/Anthropic/OpenAI/Ollama
  locale, provider intercambiabile per creator) seguendo persona + istruzioni standard +
  istruzioni custom impostabili da pannello admin, con difese anti-prompt-injection sia in
  input (delimitatori espliciti) sia in output (`services/outputGuardrail.ts`).
- Macchina a stati per il flusso "sexchat" (4 fasi, brief pagina 5): l'escalation non è solo
  un contatore di messaggi ma tiene conto anche di un "heat score" calcolato sul contenuto
  recente del fan (`services/sexchatHeat.ts`) — un fan freddo resta più a lungo in teaser
  invece di ricevere comunque un'offerta a pagamento.
- Matching automatico "richiesta del fan → contenuto del catalogo" (`services/contentMatcher.ts`):
  un match confident istruisce la vendita diretta, i candidati più deboli vengono proposti al
  LLM come possibilità, lasciando a lui la decisione semantica finale sul contesto della frase.
- Indicatore "sta scrivendo..." nativo Telegram mostrato subito all'arrivo del messaggio
  (non solo dopo la generazione), più tempo di risposta simulato in base a lunghezza del
  messaggio e ora del giorno (di notte si scrive più lentamente).
- Fast-path (<5ms) per risposte a domande ricorrenti (link di pagamento, esito verifica)
  senza passare dal LLM, e cache in RAM delle regole globali.
- Coda di invio persistente con retry/backoff, per risolvere il bug "il bot lascia
  indietro alcune chat": nessun messaggio sparisce silenziosamente, e c'è una dashboard
  per vedere/ritentare quelli falliti.
- Contatore "max messaggi per fan" corretto (era il secondo bug segnalato nel brief).
- Contenuti singoli vendibili, organizzati per cartella (brief pagina 5), con
  sblocchi/incasso reali per oggetto (non stimati).
- Listino prezzi per videochiamate e video personalizzati.
- Follow-up giornaliero automatico, solo su chat con attività dello stesso giorno,
  con tetto giornaliero configurabile, rotazione di varianti testuali, jitter tra invii e
  rispetto dell'opt-out esplicito del fan — vedi `docs/telegram-automation-limits.md`.
- Cartelle Telegram REALI (non solo un tag interno) via login MTProto one-time
  (`services/telegramMtproto.ts`, tab "Fan & Cartelle" del pannello).
- Incasso reale tracciato in `Transaction` (pagamenti esterni confermati con importo,
  contenuti marcati venduti), sommato in dashboard — non più una stima fissa.
- Sicurezza: rate-limit login e revoca token JWT persistiti su DB, credenziali (API key LLM,
  token bot, sessione MTProto) cifrate at-rest (AES-256-GCM), header di sicurezza, limite
  payload, isolamento multi-tenant tra creator sulle route sensibili.
- Backup automatico notturno del DB SQLite con retention 7 giorni.
- Pannello admin (React) per gestire tutto quanto sopra, un bot per creator.
- **Utenti multipli con ruoli** (tab "Utenti & Chatter", solo owner): un "owner" ha
  accesso completo a tutte le creator e alle impostazioni condivise (regole globali,
  dashboard aggregata, login MTProto, gestione utenti); un "chatter" vede/gestisce
  SOLO le creator che gli vengono assegnate — pensato per un'agenzia con più operatori
  che gestiscono creator/clienti diversi senza vedersi a vicenda i dati (fan, incassi,
  istruzioni). Isolamento applicato a livello di API (`routes/creatorAccess.ts`), non
  solo nascosto nell'interfaccia. Se non serve la separazione, basta creare tutti gli
  utenti come "owner" (o restare con un unico login condiviso) — non è obbligatorio.
- Suite di test automatici (`npm test`) sulle funzioni pure del dominio (delay, matching,
  heat score, guardrail, crypto, fast-path, opt-out) più test di integrazione con DB
  reale (state machine sexchat, isolamento multi-utente).

## Cosa è stato cambiato rispetto al brief originale, e perché

1. **Testo del messaggio-tipo sessualmente esplicito (brief pagina 4)** — non l'ho
   generato io. Il sistema di istruzioni AI (`ExtraInstruction`, tab "Persona & AI Settings"
   nel pannello) è pronto e generico: il testo delle istruzioni custom lo scrive chi
   gestisce il pannello, campo libero.
2. **"Digli che controlli e non rispondere più" per i pagamenti esterni** — il problema
   non era verificare (verificare è legittimo), ma promettere un controllo e poi non
   rispondere mai, qualunque fosse l'esito. Ora la verifica è un flusso vero: quando un
   fan dichiara un pagamento esterno, viene creata automaticamente una richiesta
   tracciata (`ExternalPaymentClaim`), visibile nel pannello admin (tab "Verifica
   Pagamenti"). Chi gestisce il profilo la risolve come confermata (con importo reale) o
   non trovata, e in entrambi i casi il bot manda al fan l'esito reale — mai un
   "controllo" seguito dal silenzio.
3. **Ricerca dei limiti "prima che Telegram consideri spam"** — fatta, vedi
   `docs/telegram-automation-limits.md`. Telegram non pubblica soglie ufficiali di
   ban/spam, ma dati di community indicano che poche segnalazioni (5-7/24h) possono far
   scattare limitazioni, e che testo identico a molti utenti è un pattern riconosciuto.
   Applicato: tetto giornaliero prudenziale, rotazione di varianti testuali, jitter tra
   invii, rispetto dell'opt-out del fan.

Nota tecnica sulle cartelle Telegram (brief pagina 1): la Bot API **non permette** di
creare/modificare le cartelle chat dell'account personale — serve una sessione utente
MTProto autorizzata dal proprietario (login one-time con numero di telefono + codice SMS,
vedi tab "Fan & Cartelle" → "Cartelle Telegram Reali"). ⚠️ Questa parte è stata scritta e
compila correttamente, ma **non è mai stata testata contro un account Telegram reale**
(nessun account disponibile in fase di sviluppo) — la prima volta che la si usa va
verificata con attenzione. Resta comunque disponibile il tag interno `Fan.folderTag` come
fallback sempre funzionante, indipendente dal login MTProto.

## Setup locale

Prerequisiti: Node.js 20+, npm.

```bash
cd chatbot-project
npm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

Apri `apps/server/.env` e compila almeno:
- `ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY`/`OPENAI_API_KEY` (o usa `llmProvider=ollama` per
  girare gratis in locale con Ollama)
- `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` (l'utente admin iniziale)
- `ADMIN_JWT_SECRET` (una stringa lunga e casuale)
- `ENCRYPTION_KEY` (un'altra stringa casuale, diversa dal JWT secret — cifra le
  credenziali salvate su DB)

`TELEGRAM_API_ID`/`TELEGRAM_API_HASH` servono solo per le cartelle Telegram reali via
MTProto (opzionale, vedi sopra) — registrali gratis su https://my.telegram.org/apps.

Il `TELEGRAM_BOT_TOKEN` di esempio nel `.env` non è usato direttamente: ogni bot Telegram
si configura per-creator dal pannello admin (tab "Persona & AI Settings" del creator), non
nel `.env`. Questo perché il sistema è multi-creator: un processo bot per ciascun creator
attivo.

Poi:

```bash
npm run prisma:generate
npx prisma migrate deploy -w apps/server
npx prisma db seed -w apps/server   # crea l'utente admin

npm run dev:server   # avvia API + bot (porta 4000)
npm run dev:web       # avvia pannello admin (porta 5173)
```

Vai su `http://localhost:5173`, accedi con le credenziali admin impostate nel `.env`
(questo primo utente è sempre "owner"), crea un creator, incolla il token del bot (da
@BotFather) nella tab "Persona & AI Settings" e salva: il bot corrispondente parte
automaticamente.

Se servono altri operatori (chatter): tab "Utenti & Chatter" → crea l'account → assegna
le creator che deve gestire. Vedi sezione "Cosa fa" sopra per i dettagli sui ruoli.

### Test

```bash
npm test
```

Esegue la suite di test automatici (vitest) sulle funzioni pure del dominio: calcolo
ritardo digitazione, matching contenuti, heat score sexchat, guardrail output, cifratura
credenziali, fast-path, rilevamento opt-out.

## Struttura

```
apps/server           API Express + bot Telegram (grammY) + Prisma/SQLite
apps/web              Pannello admin React (Vite)
apps/license-server   Server di licenze per chi vende Nugis (uso interno, vedi docs/license-server.md)
docs/                 Note di ricerca (limiti Telegram, GDPR, licenze, Docker)
```

## Limiti noti / cose da decidere prima di andare in produzione

- Il pagamento (Telegram Stars / link tribute) resta gestito esternamente: il bot invia
  il link, la conferma dell'incasso reale resta un passaggio umano dell'admin (il bot non
  può verificare da solo un bonifico/Tribute esterno).
- Un bot per creator è la strada indicata dal founder nel brief per il bug di
  sovraccarico; se in futuro serve un solo bot condiviso, la coda va estesa con
  prioritizzazione per creator.
- **Le cartelle Telegram reali (MTProto) non sono mai state testate contro un account
  reale** — vedi nota sopra. È l'unico punto rimasto che non posso chiudere io: serve il
  numero di telefono e il codice OTP di chi gestisce l'account, che nessun agente può
  fornire al posto tuo.
- Matching contenuti, opt-out e dichiarazione di pagamento esterno usano un'euristica a
  parole chiave **combinata in OR con una valutazione semantica del LLM stesso**
  (`services/heatTag.ts`, tag invisibili appesi alla risposta già generata, zero chiamate
  extra): il LLM coglie sarcasmo, frasi indirette e slang che le parole chiave da sole
  perderebbero, e le parole chiave restano come rete di sicurezza se il LLM non segue il
  formato del tag. Testato con scenari di integrazione (DB reale), non con traffico
  reale — nessun A/B è falsificabile senza fan veri.
- Nessun deploy incluso: il progetto è pensato per girare in locale per ora.
