# Pacchetto Docker (on-premise)

Modo per consegnare Nugis come pacchetto eseguibile ovunque ci sia Docker, senza dover
installare Node.js/npm/Prisma a mano sulla macchina del cliente.

⚠️ **Prima di usare questo pacchetto per una consegna on-premise a un cliente esterno**,
leggi la nota sulla licenza GPL-3.0 in fondo a questo file — riguarda la funzione
cartelle Telegram reali (MTProto) ed è rilevante legalmente, non solo tecnicamente.

## Uso rapido

```bash
cp .env.docker.example .env.docker
# apri .env.docker e compila almeno: ADMIN_JWT_SECRET, ADMIN_DEFAULT_EMAIL,
# ADMIN_DEFAULT_PASSWORD, ENCRYPTION_KEY, e la chiave LLM che vuoi usare

docker compose up -d --build
```

Il pannello è su `http://localhost:8080`. L'API interna (porta 4000) non è esposta
all'esterno: il container `web` (nginx) fa da reverse proxy verso `server`, il browser
parla con una sola origine.

Al primo avvio, il container `server` applica le migrazioni Prisma automaticamente
(`prisma migrate deploy`) ma **non crea l'utente admin da solo** — va seedato a mano una
volta:

```bash
docker compose exec server npx prisma db seed
```

## Dati persistenti

Il database SQLite vive nel volume Docker `nugis_data` (path `/data/nugis.db` dentro il
container), non nell'immagine: `docker compose down` non cancella i dati, `docker compose
down -v` sì (cancella anche il volume — usare solo se si vuole ripartire da zero).

Backup: basta copiare il volume, oppure entrare nel container ed esportare il file:

```bash
docker compose cp server:/data/nugis.db ./backup-nugis-$(date +%Y%m%d).db
```

## Aggiornare a una versione nuova del codice

```bash
git pull
docker compose up -d --build
```

Le migrazioni Prisma vengono applicate automaticamente al riavvio del container
`server` — non serve nessun passaggio manuale per gli aggiornamenti di schema.

## Nota legale sulla licenza GPL-3.0 (MTProto)

La libreria usata per le cartelle Telegram reali (`telegram`, alias GramJS) dipende da
`@cryptography/aes`, che è licenziata **GPL-3.0-or-later**. Non è un problema per l'uso
come SaaS (tu ospiti il servizio, il cliente lo usa solo via browser — la GPL scatta sulla
*distribuzione* del software, non sull'uso come servizio). **Lo è potenzialmente se
consegni questo pacchetto Docker (o il codice sorgente) a un cliente esterno**: distribuire
codice che dipende da una libreria GPL-3.0 può comportare obblighi di rilascio del codice
sorgente dell'intero prodotto sotto licenza compatibile.

Questo non è consulenza legale — è un fatto tecnico verificabile
(`node_modules/@cryptography/aes/package.json`) da portare a un avvocato prima di
distribuire il pacchetto a terzi. Se il modello di vendita è on-premise/licenza, le
opzioni pratiche sono: isolare il servizio MTProto in un componente separato non
distribuito insieme al resto (fornito solo come servizio da voi gestito), oppure
verificare se esiste un'alternativa a GramJS senza questa dipendenza.
