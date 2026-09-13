# Trattamento dati e GDPR

⚠️ **Questo documento è tecnico, non è consulenza legale.** Descrive cosa il sistema fa
davvero con i dati, così chi deve valutare la conformità (voi, un DPO, un avvocato) parte
da fatti verificabili invece che da supposizioni. Prima di dichiarare conformità GDPR a
un cliente, va rivisto da un legale — specialmente le basi giuridiche del trattamento e
l'informativa privacy da mostrare ai fan, che il sistema NON genera da solo.

## Quali dati personali vengono trattati

| Dato | Dove | Perché |
|---|---|---|
| ID chat Telegram, nome visualizzato | `Fan` | Identificare il fan e rispondergli |
| Testo dei messaggi (in e out) | `Message` | Storico conversazione, contesto per il LLM |
| Dichiarazioni di pagamento esterno | `ExternalPaymentClaim` | Verifica manuale dal team |
| Importi di vendite confermate | `Transaction` | Contabilità/incassi (dato semi-anonimo: collegato al fan solo finché non viene cancellato, vedi sotto) |
| Numero di telefono dell'operatore MTProto | `TelegramUserSession` | Gestione cartelle Telegram reali (dato dell'operatore, non del fan) |

**Non viene raccolto**: nome reale, email, indirizzo, dati di pagamento (il sistema non
processa mai pagamenti direttamente — solo link esterni a Tribute/Stars).

## Diritto di accesso (art. 15 GDPR)

`GET /admin/fans/:id/gdpr-export` (dal pannello, tab Fan) restituisce un JSON con tutti i
dati collegati a un fan: anagrafica minima, messaggi, richieste di pagamento, transazioni.

## Diritto alla cancellazione (art. 17 GDPR)

`DELETE /admin/fans/:id/gdpr-erase` cancella:
- Il record `Fan` (nome, chat ID, tag, fase sexchat, heat score)
- Tutti i `Message` collegati (cancellazione a cascata)
- Tutti gli `ExternalPaymentClaim` collegati (cancellazione a cascata)

**Non cancella** le `Transaction` (incassi confermati): per obblighi di conservazione
contabile/fiscale, l'incasso resta a bilancio, ma perde il collegamento diretto al fan
(il campo `fanId` diventa `null` automaticamente — vedi `Transaction.fanId` nello
schema Prisma, `onDelete: SetNull`). Il dato finanziario resta, il dato personale no.

## Conservazione e minimizzazione già implementate

- `RevokedToken` (token JWT revocati) e `LoginAttempt` (rate-limit login) vengono
  ripuliti automaticamente dopo 12h/24h (`jobs/cleanupExpiredSecurity.ts`) — non dati
  del fan, ma buona pratica di minimizzazione già in codice.
- Backup automatico del DB con retention 7 giorni (`jobs/dbBackup.ts`): da tenere
  presente che una cancellazione GDPR non rimuove automaticamente la persona dai
  backup più vecchi di 7 giorni già scaduti, ma un backup fatto ieri e non ancora
  scaduto **conterrà ancora il dato cancellato oggi** fino a quando quel backup non
  scade — è un limite tecnico noto di qualunque sistema con backup a rotazione, da
  segnalare esplicitamente in un'eventuale informativa.

## Cosa manca (non implementato, da valutare con un legale)

- **Informativa privacy** mostrata al fan: il bot non manda mai un link/testo di
  informativa privacy quando un fan inizia a scrivere. Se serve per conformità, va
  aggiunta come messaggio automatico al primo contatto.
- **Base giuridica del trattamento**: il sistema non implementa un consenso esplicito
  raccolto dal fan — il trattamento si basa presumibilmente su un altro fondamento
  (es. esecuzione di un rapporto commerciale), da confermare con un legale.
- **Registro dei trattamenti** e DPA (Data Processing Agreement) tra chi rivende il
  software e chi lo usa: documenti organizzativi, non tecnici — vanno scritti a parte.
- **Trasferimento dati extra-UE**: se si usa DeepSeek (server in Cina) o altri provider
  LLM extra-UE, i messaggi dei fan (dati personali) escono dall'UE per la generazione
  della risposta — un punto che un legale deve valutare esplicitamente rispetto al
  GDPR (clausole contrattuali standard, adeguatezza, ecc.).
