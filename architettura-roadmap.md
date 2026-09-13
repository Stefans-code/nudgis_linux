# Chatbot Telegram — Architettura & Roadmap

*Bozza tecnica interna, aggiornata al 5 settembre 2026. Riferimento: "Brief rapido chatbot.pdf" + call con il cliente.*

## 1. Decisioni prese

| # | Tema | Decisione |
|---|------|-----------|
| 1 | Utenti | Account Telegram unico e condiviso, nessun sistema di permessi separati per l'MVP. Schema DB comunque "multi-ruolo ready" per non pagare refactoring in futuro. |
| 2 | Stop bot | Doppio meccanismo: comando manuale in chat (`/stop` o bottone inline) come soluzione primaria e affidabile; stop automatico euristico (silenzia la chat X minuti se rileva un invio manuale) come miglioria successiva, non bloccante per la demo. |
| 3 | Admin | Stesso account, nessuna separazione di ruoli richiesta ora. |
| 4 | Modello AI | Migrazione da DeepSeek a un modello di qualità superiore. **Decisione di default finché non arriva conferma esplicita del cliente:** non usare l'API OpenAI "vanilla" per la generazione dei messaggi in sexchat, perché le usage policy OpenAI vietano contenuti sessualmente espliciti via API e il rischio è la sospensione della chiave quando il volume cresce. Uso previsto: provider specializzato in inferenza su modelli open-weight senza restrizioni NSFW per la parte sexchat; eventualmente OpenAI resta disponibile per le parti non esplicite del flusso (small talk, follow-up generico, gestione richieste). Va confermato col cliente prima di sviluppare su questa base — è una scelta commerciale sua, non solo tecnica. |
| 5 | Locale vs API | Confermato: architettura basata su API, niente hosting locale del modello. |
| 6 | Età / GDPR | Il cliente ha confuso i due temi: la GDPR riguarda il trattamento dati, non la verifica maggiore età di chi riceve contenuti sessualmente espliciti. Per l'MVP interno si rimanda, ma va tenuto in nota per la versione rivendibile (punto 7/8) perché un'agenzia seria potrebbe richiederlo. |
| 7/8 | Licensing / vendita standalone | Nessuno script di licensing ora — prematuro senza un compratore reale. Si progetta però da subito in modo da rendere economica la conversione futura: config per-creator via env/file (niente hardcoded), containerizzazione Docker Compose fin dall'MVP, netta separazione tra "logica bot" (portabile) e "infrastruttura nostra" (billing/dashboard multi-tenant, resta nostra). Il layer di licensing si costruisce solo quando c'è un acquirente concreto sul tavolo. |
| 9/10 | Architettura generale / timeline | Vedi sezioni sotto. Demo: dopo il 15 settembre — il cliente non l'ha ancora testato internamente, lo farà direttamente dal cliente finale. |

## 2. Requisiti funzionali dal brief (da PDF)

- Velocità di risposta maggiore, con **tempo di risposta realisticamente variabile** in base alla lunghezza del messaggio (non istantaneo).
- Prompt injection defense robusta.
- Due modalità di vendita: **sexchat conversazionale** (a cartelle/categorie, non un'unica sezione indifferenziata come ora) e **vendita di contenuto singolo** (foto/video specifici caricabili e taggabili, incluse richieste "live" tipo foto situazionali).
- Follow-up automatico delle chat **funzionante** (quello attuale non va).
- Auto-aggiunta clienti a cartella Telegram, se tecnicamente fattibile.
- Ricontatto automatico giornaliero delle chat del giorno stesso (non del giorno prima) — **da validare**: serve ricerca sui limiti anti-spam di Telegram per l'automazione prima di attivarlo, rischio ban dell'account.
- Pannello admin per: impostazioni AI per singola "creator", extra instructions personalizzabili per creator, aggiunta di nuove creator dal pannello.
- Extra instructions: alcune sono "nostro standard" (es. non mandare mai il listino completo, fare 5-6 messaggi prima di proporre contenuti a pagamento, chiedere budget/preferenze prima di proporre), altre devono restare configurabili per singola creator/agenzia.
- Preferenza dichiarata: sviluppare bene la parte web/admin; mini-app e comandi bot secondari possono essere trascurati per ora.

## 3. Bug attuali da risolvere nel redesign

Dal brief, risposta diretta del founder attuale:
- Il bot **lascia indietro chat senza rispondere** quando il volume sale, per i rate limit di Telegram sui troppi messaggi mandati.
- La funzione "max message" non funziona.

Due strategie proposte dal founder: (a) retry del messaggio anche dopo 10 minuti se il bot è "impallato"; (b) **un'istanza di bot separata per utilizzatore/creator**, così i limiti di uno non influenzano gli altri.

**Raccomandazione:** la (b) è architetturalmente più solida ed è coerente con l'obiettivo di rivendibilità multi-tenant (coda/istanza isolata per creator invece di un monolite condiviso che si intasa). La userei come base del redesign, con (a) come fallback per resilienza in caso di rate-limit temporaneo anche a livello di singola istanza.

## 3bis. Screenshot del pannello attuale (da PDF, pag. 2-5)

Il PDF contiene 4 screenshot del pannello admin esistente "Fan Connect" (non solo testo — verificati tutti, nessuno mancante):

- **Broadcast** (`/massmessage` in chat Telegram): preview messaggio, countdown 10s, invio a N utenti con report sent/failed.
- **Tab Creators**: lista creator con card (foto, stato "AI ON", earnings, media/paid count), form "Add Creator by ID or Username" → conferma che l'aggiunta creator da pannello (richiesta nel brief) è già presente nell'attuale, va solo portata nel redesign.
- **AI Settings per creator**: toggle "AI Chatta" ON/OFF e toggle "auto-engagement" (gira ogni 5 min sulle chat con ultimo messaggio assistant tra 5 e 10 min fa — **è già il meccanismo di ricontatto automatico** richiesto nel brief, punto da validare per rischio spam/ban ma non da reinventare da zero), anagrafica creator, link canali/VIP/pagamento, box "Extra Instructions" in plain text, "Shortcuts" per comandi rapidi (es. `/listino`).
- **Dashboard creator**: earnings, libreria media/paidmedia con prezzi e unlock.

⚠️ **Da questo screenshot emerge una API key DeepSeek esposta in chiaro** nel campo "DeepSeek API Key" del pannello attuale. Se è ancora attiva **va ruotata subito** — è finita in un file che gira. Nel redesign: le chiavi API non vanno mai visualizzate in chiaro in un campo testo, solo mascherate (es. `sk-e70b...9c9`) con opzione "rigenera", mai "mostra".

## 4. Prossimi passi

1. Confermare col cliente la scelta del modello AI (punto 4) prima di iniziare lo sviluppo — è la decisione che condiziona tutta la pipeline di generazione messaggi.
2. Ricerca rapida sui limiti di automazione Telegram (ricontatto giornaliero) prima di costruire quella funzione come automatica.
3. Disegnare lo schema dati "creator" (impostazioni AI, extra instructions, contenuti caricabili, prezzi) come entità di primo livello nel DB, pensando già a multi-tenant.
4. Prototipo architettura a istanza-per-creator per risolvere i bug di rate limit.
5. Demo dal vivo dal cliente dopo il 15 settembre (non ancora testata internamente).
