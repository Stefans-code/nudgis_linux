# Server di Licenze (per l'ufficio che vende Nugis)

Strumento interno, separato dal prodotto Nugis vero e proprio: lo gestisce solo chi
vende le licenze (l'ufficio), i clienti finali non ci accedono mai direttamente.

**Testato dal vivo** (creazione → validazione → revoca → eliminazione, ciclo completo
con richieste HTTP reali), non solo scritto e compilato.

## Come funziona, in breve

```
[Ufficio] server di licenze (apps/license-server) — genera chiavi, le gestisce
    ↑ POST /validate (ogni ~6h, automatico)
[Cliente] installazione Nugis (apps/server) — verifica di essere ancora valida
```

Se un'installazione Nugis **non** ha `LICENSE_SERVER_URL`/`LICENSE_KEY` configurati nel
suo `.env`, il controllo è semplicemente disattivato — nessuna restrizione. Il controllo
scatta SOLO se configurato: è pensato per le installazioni vendute, non per l'uso interno.

## Setup del server di licenze (una volta sola, lo ospita l'ufficio)

```bash
cd apps/license-server
cp .env.example .env
# apri .env e imposta LICENSE_ADMIN_SECRET (stringa lunga e casuale, es.
# node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")

npm run prisma:generate -w apps/license-server
npx prisma migrate deploy --schema apps/license-server/prisma/schema.prisma
npm run dev:license-server
```

> **Bug corretto (29/08/2026)**: `DATABASE_URL` in `.env.example` puntava a
> `file:./prisma/licenses.db`. Prisma risolve i path relativi di `DATABASE_URL`
> rispetto alla cartella dove sta `schema.prisma` (cioè `prisma/`), non rispetto alla
> working directory da cui lanci il comando — quel valore creava quindi il file in
> `prisma/prisma/licenses.db` invece che in `prisma/licenses.db`. Il valore corretto,
> già in `.env.example`, è `file:./licenses.db`.

Va tenuto **sempre acceso e raggiungibile** dalle installazioni dei clienti (un server
con IP fisso o un dominio, non un laptop che si spegne la sera) — se è irraggiungibile
per più di 5 giorni consecutivi, le installazioni clienti smettono di funzionare (grace
period, vedi `services/licensing.ts` in apps/server).

## Creare una licenza per un nuovo cliente

```bash
curl -X POST http://IP_UFFICIO:5000/admin/licenses \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: IL_TUO_LICENSE_ADMIN_SECRET" \
  -d '{
    "customerName": "Nome Cliente SRL",
    "expiresAt": "2027-01-01T00:00:00Z",
    "maxCreators": 5,
    "notes": "Piano annuale, rinnovo gennaio"
  }'
```

La risposta contiene `"key": "NUGIS-XXXX-XXXX-XXXX-XXXX"` — **copiala subito**, non viene
più mostrata per intero dopo (le liste successive la mostrano mascherata). Comunicala al
cliente insieme a `LICENSE_SERVER_URL` (l'indirizzo del vostro server) da mettere nel
`.env` della sua installazione Nugis.

## Gestione licenze esistenti

```bash
# Elenco (chiavi mascherate)
curl http://IP_UFFICIO:5000/admin/licenses -H "x-admin-secret: ..."

# Estendere la scadenza / cambiare il limite creator
curl -X PATCH http://IP_UFFICIO:5000/admin/licenses/ID \
  -H "x-admin-secret: ..." -H "Content-Type: application/json" \
  -d '{"expiresAt": "2028-01-01T00:00:00Z", "maxCreators": 10}'

# Revocare (il cliente smette di funzionare al prossimo check, entro 6h)
curl -X PATCH http://IP_UFFICIO:5000/admin/licenses/ID \
  -H "x-admin-secret: ..." -H "Content-Type: application/json" \
  -d '{"status": "revoked"}'
```

Ogni licenza tiene traccia di `lastCheckAt`/`lastCheckInstanceId`: utile per vedere se e
quando un cliente ha effettivamente controllato l'ultima volta.

## Lato installazione cliente (Nugis)

Nel `.env` di `apps/server` del cliente:

```
LICENSE_SERVER_URL="http://IP_UFFICIO:5000"
LICENSE_KEY="NUGIS-XXXX-XXXX-XXXX-XXXX"
```

Da quel momento: verifica al boot + ogni 6 ore. Se non valida, i bot Telegram non
partono e il pannello mostra un banner rosso in cima a ogni pagina — i dati del cliente
NON vengono toccati/cancellati, solo il servizio si ferma.

## Limiti onesti di questo sistema

- **Non è DRM vero**: chi ha accesso al codice sorgente di Nugis può, tecnicamente,
  rimuovere il controllo licenza. La protezione reale è il contratto commerciale, non
  la tecnologia — vedi la discussione su come "chiudere in un applicativo" per il
  quadro completo.
- **Nessuna interfaccia grafica** per gestire le licenze: solo `curl`/API dirette. Se
  servono più licenze da gestire regolarmente, vale la pena costruire una piccola UI
  sopra queste stesse route (sono già pronte).
- **Un solo segreto condiviso** per l'accesso admin (`LICENSE_ADMIN_SECRET`), non un
  vero sistema di utenti multipli — adeguato per un piccolo ufficio, non per un team
  grande con necessità di permessi differenziati.
