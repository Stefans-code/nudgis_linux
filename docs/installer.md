# Installer Windows (NugisSetup.exe)

Non va confuso con `Nugis.exe` (vedi `docs/exe-packaging.md`): sono due cose diverse.

```
NugisSetup.exe   <- lo lanci UNA VOLTA sul PC del cliente. Copia i file, chiede le
                    credenziali admin e la licenza, poi non serve più.
Nugis.exe        <- l'app vera, quella che l'installer mette dentro
                    Program Files\Nugis e fa partire (bot + API + pannello web,
                    tutto in un solo processo).
```

## Come si costruisce

```bash
npm run build:installer -w apps/server
```

Fa due cose in sequenza (`scripts/build-installer.js`):
1. Builda `Nugis.exe` (`scripts/build-exe.js`, stesso processo di `docs/exe-packaging.md`)
2. Lo pacchettizza con **Inno Setup 6** (`installer/nugis.iss`) in un unico
   `installer-output/NugisSetup.exe`

Richiede Inno Setup 6 installato (`ISCC.exe`) sulla macchina dove fai la build — non
sulla macchina del cliente, solo su quella dello sviluppatore/ufficio.

Per una build di test più veloce (salta l'offuscamento):
```bash
SKIP_OBFUSCATE=1 npm run build:installer -w apps/server
```

## Cosa fa l'installer, in ordine

1. Chiede la cartella di installazione (default `Program Files\Nugis`)
2. **Pagina "Account amministratore"**: email + password (min. 8 caratteri) + conferma.
   Questa email **non è usata per inviare nulla** — nel progetto non esiste nessuna
   configurazione SMTP/invio email (verificato: zero occorrenze di `nodemailer`/`smtp`
   nel codice). È solo lo username di login per il pannello web, salvato nel database
   locale di quell'installazione.
3. **Pagina "Licenza" (opzionale)**: indirizzo del license-server dell'ufficio + chiave
   `NUGIS-XXXX-...`. Si può lasciare vuota per un uso interno senza restrizioni — vedi
   `docs/license-server.md` per come generarne una.
4. Copia i file, poi **genera da solo il `.env`**: `DATABASE_URL` assoluto puntato
   dentro la cartella di installazione, `ADMIN_JWT_SECRET` ed `ENCRYPTION_KEY` casuali
   (generati con l'RNG crittografico di PowerShell, non un generatore debole) — questi
   due non vengono mai chiesti all'utente, sono segreti tecnici, non credenziali da
   scegliere o ricordare.
5. Registra un'**attività pianificata di Windows** (`schtasks`) che avvia `Nugis.exe`
   all'accensione del PC, come account SYSTEM, in sessione non interattiva: niente
   finestra console visibile, e se il processo termina riparte da solo (fino a 3
   tentativi/minuto).
6. Avvia subito l'attività e apre il browser su `http://localhost:4000`.

La disinstallazione (dal Pannello di controllo o dal collegamento nel menu Start) ferma
il processo, rimuove l'attività pianificata e cancella i file installati.

## Perché un'attività pianificata e non un vero "servizio Windows"

Un vero servizio Windows richiede che l'eseguibile parli il protocollo SCM (Service
Control Manager) di Windows — il nostro non lo fa, essendo un normale processo Node
impacchettato con `pkg`. La via più comune per aggirarlo è un wrapper di terze parti
(es. NSSM), ma imbarcare un binario non firmato di terze parti in un installer
commerciale è un compromesso di fiducia/supply-chain che non ho voluto prendere senza
un confronto esplicito con chi vende il prodotto. L'attività pianificata con
`/RU SYSTEM /SC ONSTART` ottiene lo stesso risultato pratico (avvio automatico prima
del login, nessuna finestra, riavvio dopo crash) senza dipendenze esterne.

## Stato del collaudo (onesto)

- **Compilazione**: verificata — Inno Setup compila senza errori includendo tutti i
  file attesi (se un sorgente mancasse, la compilazione fallirebbe). Durante lo
  sviluppo dello script sono stati trovati e corretti due bug reali di sintassi Pascal
  (`GetTickCount` non esiste in Inno Setup Pascal Script; uso scorretto del valore di
  ritorno di `StringChangeEx`, che modifica la stringa per riferimento e ritorna un
  Integer, non una String).
- **Esecuzione reale del wizard NON testata**: l'installazione vera (elevazione UAC,
  scrittura in Program Files, generazione `.env`, registrazione dell'attività
  pianificata, disinstallazione) richiede di modificare il sistema della macchina di
  sviluppo (installare in Program Files, creare un task SYSTEM) — è stato deciso di
  **non farlo automaticamente** senza conferma esplicita, e al momento della stesura di
  questo documento quella conferma non è ancora arrivata. **Prima di consegnare
  l'installer a un cliente vero, va fatto almeno un giro di test completo su una
  macchina Windows pulita** (o una VM), verificando in particolare: il wizard scrive un
  `.env` valido, `Nugis.exe` parte davvero dall'attività pianificata dopo un riavvio del
  PC, e la disinstallazione non lascia residui.

## Cosa manca ancora per un prodotto commercialmente "pulito"

- **Firma digitale (code-signing)**: né `Nugis.exe` né `NugisSetup.exe` sono firmati.
  Windows SmartScreen mostrerà un avviso "Editore sconosciuto" al cliente. Serve un
  certificato Authenticode (tipicamente 70-300€/anno) per rimuoverlo.
- **Icona personalizzata** per l'installer e l'eseguibile (oggi usano quella di default
  di Inno Setup/pkg).
- Vedi anche `docs/license-server.md`, sezione finale, per cosa manca lato gestione
  licenze (nessuna UI, solo API dirette).
