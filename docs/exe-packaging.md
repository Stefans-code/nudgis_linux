# Distribuzione come eseguibile Windows (.exe)

## Come funziona

`npm run build:exe -w apps/server` produce una cartella `apps/server/dist-exe/` con:

```
dist-exe/
  Nugis.exe                    <- avvialo, fa partire API + pannello web insieme
  public/                      <- build statica del pannello (servita dallo stesso .exe)
  generated/prisma-client/     <- client Prisma + motore nativo
  prisma/migrations/           <- applicate automaticamente all'avvio
  .env.example                 <- copia in .env e compila prima del primo avvio
```

**Non è un singolo file autosufficiente al 100%** — Prisma richiede un motore nativo
(query engine, un file binario) che `pkg` non può fondere dentro l'eseguibile. È normale
per applicazioni Node.js pacchettizzate: si distribuisce una cartella, non un unico file.
Il pannello web invece è servito direttamente dallo stesso processo (niente nginx/secondo
eseguibile separato, a differenza della versione Docker).

## Perché non è DRM vero (va detto chiaramente al cliente/socio, non solo letto qui)

Il codice viene offuscato (`javascript-obfuscator`) prima di essere impacchettato con
`pkg`: non è più testo leggibile in chiaro come il progetto sorgente, e non è estraibile
con un semplice editor di testo. Ma:
- Esistono strumenti pubblici per "spacchettare" i binari `pkg` e risalire al codice
  offuscato
- Il codice offuscato, anche se difficile da leggere, resta deoffuscabile con impegno
  e strumenti dedicati

**La protezione reale resta il contratto di licenza commerciale**, non questo
meccanismo tecnico. Il controllo licenza (`apps/license-server`) serve a far
scadere/revocare un cliente che smette di pagare tramite un server centrale che *voi*
controllate — non a rendere il software "inviolabile".

## Requisiti per fare la build

- Windows con Node.js 20+ (la build va fatta su Windows per un output `win-x64`)
- Connessione internet la prima volta (pkg scarica un binario Node precompilato,
  poi lo mette in cache locale — build successive sono più veloci)
- **Nessun compilatore C++/Visual Studio necessario SE il binario precompilato è
  disponibile** per la combinazione versione Node + piattaforma scelta. Se pkg non lo
  trova nella sua cache remota, prova a compilare Node da sorgente — richiesto Visual
  Studio Build Tools con i workload C++, un processo lungo (30+ minuti) e pesante.
  Se capita, conviene cambiare la versione target Node (es. `node20` invece di
  `node18`) prima di installare un intero toolchain di compilazione.

## Build più veloci in fase di test

```bash
SKIP_OBFUSCATE=1 npm run build:exe -w apps/server
```

Salta l'offuscamento (che rallenta la build e non serve mentre stai ancora testando che
tutto funzioni) — usalo solo per le build che consegni davvero al cliente.

## Prima del primo avvio sulla macchina del cliente

Se distribuisci solo la cartella `dist-exe/` senza installer (vedi `docs/installer.md`
per il caso normale, con installer):

1. Copia `.env.example` in `.env` dentro `dist-exe/`
2. Compila almeno: `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD`,
   `ENCRYPTION_KEY` — occhio a non lasciare righe duplicate della stessa chiave nel
   file: `dotenv` usa la **prima** occorrenza, quindi se `.env.example` ha già un
   placeholder per una chiave e ne aggiungi un'altra riga sotto con `>>`, vince quella
   sbagliata in cima. Meglio rigenerare il file da zero.
3. `DATABASE_URL` deve essere un **path assoluto** (es.
   `file:C:/Nugis/nugis.db`), non relativo — dentro lo snapshot di `pkg` un path
   relativo non si risolve in modo affidabile.
4. Se è un'installazione venduta con licenza: `LICENSE_SERVER_URL` e `LICENSE_KEY`
   (vedi `docs/license-server.md`)
5. Avvia `Nugis.exe`

## Cosa fa da solo all'avvio (testato dal vivo, non solo scritto)

Nessun passaggio manuale di `prisma migrate` o di seed: `Nugis.exe`, alla partenza:

1. **Applica le migrazioni Prisma pendenti** (`services/autoMigrate.ts`) leggendo
   direttamente i file `migration.sql`, perché dentro l'exe non esiste una CLI Prisma
   installata. Verificato con tutte e 13 le migrazioni presenti al 29/08/2026.
2. **Crea il primo admin** (`services/bootstrapAdmin.ts`) da `ADMIN_DEFAULT_EMAIL`/
   `ADMIN_DEFAULT_PASSWORD` — solo se non esiste già nessun admin nel DB (così non
   resuscita credenziali di default dopo che il cliente ne ha create di sue).
3. Controlla la licenza, poi fa partire i bot Telegram delle creator configurate.

Test end-to-end confermato: `/health` → tutte le migrazioni applicate → admin creato →
login → pannello web servito dallo stesso processo su `http://localhost:4000`.
