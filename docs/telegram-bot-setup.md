# Collegare il bot Telegram di ogni creator

Ogni creator ha il **proprio** bot Telegram — non è una configurazione unica per tutta
l'installazione Nugis, va ripetuta per ciascuna.

## Flusso normale (per ogni nuova creator)

1. Crea la creator nel pannello web di Nugis
2. Su Telegram, apri una chat con **@BotFather**, crea un nuovo bot (`/newbot`), copia
   il **token** che ti dà (formato `123456789:ABC-DEF1234...`)
3. Incolla quel token nella scheda della creator, nel pannello web (campo token bot) —
   **non** va messo nel file `.env`
4. Nugis lo salva **cifrato** nel database (`encryptCredential`, vedi
   `apps/server/src/routes/creators.ts`) e fa partire il bot di quella creator in
   automatico

La riga `TELEGRAM_BOT_TOKEN` dentro `.env` è solo un **fallback opzionale** per un
eventuale bot "gateway" unico condiviso — il percorso normale/atteso è un token per
creator, inserito dal pannello.

## Cosa è diverso: le "cartelle chat reali" (MTProto)

Il brief chiede anche di poter aggiungere automaticamente i fan a una vera cartella
chat di Telegram (funzione avanzata, opzionale). Questa parte:

- **Non usa il token del bot**, ma un vero **account Telegram personale**
  dell'operatore (numero di telefono + login one-time con SMS + eventuale password 2FA)
- Richiede `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` ottenuti gratis su
  https://my.telegram.org/apps, configurati **una sola volta** nel `.env`
  dell'installazione (condivisi, non per-creator)
- Il login vero e proprio (numero + codice SMS) si fa dal pannello, sezione "Fan &
  Cartelle → Cartelle Telegram Reali" — una tantum, non automatizzabile (il codice
  arriva sul telefono dell'operatore)

**Stato di collaudo**: il codice è scritto e segue la documentazione ufficiale della
libreria (`telegram`/GramJS), ma **non è mai stato testato con un account Telegram
reale** — richiede un vero numero di telefono e un vero SMS ricevuto, cosa che non è
simulabile in un ambiente di sviluppo/test automatico. È la parte del progetto con il
collaudo più debole: va provata dal vivo con un account reale (anche uno secondario)
prima di fare affidamento su di essa in produzione. Vedi anche
`docs/telegram-automation-limits.md` per i limiti di invio/spam che si applicano
comunque a tutto ciò che manda messaggi via Telegram (bot o account MTProto).
