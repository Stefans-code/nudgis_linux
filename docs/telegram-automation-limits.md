# Ricerca: limiti di automazione Telegram per il follow-up (brief pagina 2)

> Richiesta esplicita del brief: *"VA FATTA UNA RICERCA DEI LIMITI DI AUTOMAZIONE CHAT
> TELEGRAM PER SAPERE QUANDO DIVENTA SPAM"* prima di attivare il ricontatto automatico
> su scala. Questo documento raccoglie quello che è verificabile dalle fonti ufficiali
> e quello che è solo evidenza di community (Telegram non pubblica soglie esatte).

## 1. Punto di partenza importante: qui NON è cold outreach

I fan a cui il follow-up scrive hanno **già avviato loro la conversazione** con il bot
(devono aver premuto `/start` o scritto per primi). Questo è diverso dal caso "messaggi
a sconosciuti che non hanno mai interagito col bot": un bot Telegram può tecnicamente
scrivere in qualsiasi momento a chi ha già una chat aperta con lui, non esiste una
finestra di validità a tempo come la "24h session window" di WhatsApp Business API.

Il rischio reale quindi non è "il messaggio viene bloccato per policy", ma **il fan
segnala il bot come spam se lo ricontatta troppo spesso o con testo troppo generico**,
e sono le segnalazioni ripetute a far scattare i sistemi automatici anti-spam di
Telegram sull'account del bot.

## 2. Limiti tecnici ufficiali (fonte: Telegram Bots FAQ)

Dalla [documentazione ufficiale](https://core.telegram.org/bots/faq):

- **1 messaggio/secondo** per singola chat (oltre, iniziano i 429).
- **~30 messaggi/secondo** in totale per bot in broadcast (oltre, 429), a meno di
  abilitare i *paid broadcast* (0.1 Stars/messaggio oltre soglia).
- **20 messaggi/minuto** in un gruppo.
- Risposta a un 429: header `retry_after`, unico modo corretto di gestirlo è aspettare
  quel numero di secondi e ritentare.

➡️ Questi limiti sono già rispettati dalla coda di invio ([outboundQueue.ts](../apps/server/src/services/outboundQueue.ts): 25 msg/s globali, min 1.1s per chat) — **non sono il problema per il follow-up**, che manda a fan diversi, non in burst sulla stessa chat.

## 3. Segnali di community su spam/ban (NON documentazione ufficiale — Telegram non pubblica soglie)

Fonti secondarie (blog specializzati in automazione Telegram, non Telegram stessa):

- Un volume alto e sostenuto di messaggi a destinatari "freddi" può portare alla
  revoca del token del bot nel giro di ore.
- **5-7 segnalazioni ("report spam") in 24 ore** possono bastare a far scattare un
  blocco temporaneo dell'account.
- Mandare **lo stesso testo identico** a molti utenti in una finestra breve è uno dei
  pattern che i filtri anti-spam riconoscono e penalizzano.
- Un `429` con `retry_after > 300s` è spesso indicativo di uno shadow-ban da
  segnalazioni, non di un semplice rate limit tecnico.
- Buona pratica community per outreach a freddo: restare sotto **40-50 messaggi diretti
  nuovi al giorno per account**, scalando gradualmente nelle settimane successive.

Fonti: [Bots FAQ ufficiale](https://core.telegram.org/bots/faq) · [CRMChat — Telegram Bulk Messaging Limits](https://crmchat.ai/blog/telegram-bulk-messaging-limits-risks) · [CRMChat — Bot API Outreach senza spam filter](https://crmchat.ai/blog/telegram-bot-api-outreach-tool-avoid-spam) · [grammY — Flood limits](https://grammy.dev/advanced/flood)

## 4. Regole applicate nel codice (di conseguenza)

Implementate in [followUp.ts](../apps/server/src/jobs/followUp.ts) e nel modello `FollowUpRule`:

1. **Solo chat iniziate dal fan stesso, mai cold outreach.** Il follow-up ricontatta
   solo fan che hanno già scritto (requisito già presente: "solo chat di oggi").
2. **Tetto giornaliero prudenziale per creator** (`FollowUpRule.maxPerDay`, default
   **40**, in linea con la soglia community di 40-50/giorno), non solo un limite di
   batch orario.
3. **Rotazione di 2-3 varianti testuali** (`template` / `templateVariant2` /
   `templateVariant3`) invece di un unico testo identico spedito a tutti — riduce il
   pattern "stesso messaggio a tanti utenti" che i filtri riconoscono.
4. **Jitter casuale 15-45s** fra un invio e l'altro all'interno di un batch, per non
   avere una raffica innaturale di invii ravvicinati.
5. **Rispetto dell'opt-out esplicito**: se un fan scrive "non scrivermi più", "stop",
   ecc. (vedi [followUpOptOut.ts](../apps/server/src/services/followUpOptOut.ts)),
   viene escluso per sempre dal follow-up automatico — è la difesa più diretta contro
   le segnalazioni spam, perché elimina il caso più probabile di "report".
6. **Rate limit tecnico ufficiale già rispettato** dalla coda di invio esistente.

## 5. Cosa resta un giudizio, non un fatto verificabile

Non esiste modo di sapere con certezza la soglia esatta oltre la quale Telegram
comincia a penalizzare un bot: **non è documentata pubblicamente**. I numeri sopra
(40/giorno, 5-7 report) sono stime di community, non garanzie. Il consiglio pratico è:
partire con `maxPerDay` basso (es. 20-30) per i primi bot/creator, osservare se
arrivano errori 429 con `retry_after` anomali o segnalazioni dai fan, e solo dopo
alzare gradualmente il tetto — esattamente come consigliato dalle fonti di community.
