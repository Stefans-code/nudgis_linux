import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { prisma } from "../lib/prisma";
import { encryptCredential, decryptCredential } from "./crypto";
import { logger } from "../lib/logger";

/**
 * Servizio Telegram MTProto Userbot per la gestione REALE delle cartelle chat Telegram
 * (brief pagina 1: "auto-aggiungere clienti a cartella chat Telegram se possibile").
 *
 * Differenza tra Bot API e MTProto:
 * - Bot API (quella del bot che parla coi fan): non può creare/modificare le cartelle
 *   chat dell'app dell'operatore. Non esiste un endpoint bot per farlo.
 * - MTProto (libreria GramJS, pacchetto "telegram"): è l'API usata dai client
 *   Telegram veri. Autenticandosi come UTENTE (numero di telefono + codice SMS,
 *   più eventuale password 2FA) è possibile chiamare
 *   Api.messages.UpdateDialogFilter e creare/aggiornare per davvero una cartella
 *   nell'app Telegram dell'operatore, inserendoci le chat dei fan.
 *
 * Login: richiede un login "umano" una tantum (il codice via SMS arriva sul telefono
 * dell'operatore, non può essere automatizzato da qui). Il flusso è esposto via le
 * route admin in routes/telegramAuth.ts: send-code → submit-code → (submit-password
 * se l'account ha la verifica in due passaggi) → sessione salvata cifrata su DB.
 * Una volta completato UNA VOLTA, la sessione persiste e le cartelle si aggiornano
 * in automatico senza bisogno di rifare il login.
 */

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const OWNER_SESSION_ID = "owner";

function assertConfigured() {
  if (!API_ID || !API_HASH) {
    throw new Error(
      "TELEGRAM_API_ID / TELEGRAM_API_HASH non configurati nel .env del server. " +
        "Registra un'applicazione su https://my.telegram.org/apps (gratuito) per ottenerli."
    );
  }
}

interface PendingLogin {
  client: TelegramClient;
  resolveCode?: (code: string) => void;
  rejectCode?: (err: Error) => void;
  resolvePassword?: (password: string) => void;
  rejectPassword?: (err: Error) => void;
  awaitingPassword: boolean;
  failed?: string;
}

// Stato del login multi-step in corso, tenuto in memoria SOLO per la durata del
// flusso di autenticazione (pochi minuti): non è un problema di persistenza perché,
// una volta completato, il risultato (la sessione) viene salvato su DB cifrato.
const pendingLogins = new Map<string, PendingLogin>();

/** Avvia il login: invia il codice SMS al numero indicato. */
export async function startLogin(phoneNumber: string): Promise<{ status: "code_requested" }> {
  assertConfigured();

  const existing = pendingLogins.get(phoneNumber);
  if (existing) {
    try {
      await existing.client.disconnect();
    } catch {
      /* noop */
    }
    pendingLogins.delete(phoneNumber);
  }

  const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
    connectionRetries: 3,
  });

  const pending: PendingLogin = { client, awaitingPassword: false };
  pendingLogins.set(phoneNumber, pending);

  // client.start() gestisce l'intero flusso di login MTProto internamente; i callback
  // qui sotto restano "in sospeso" (Promise mai risolta subito) finché non arriva la
  // submitLoginCode/submitLoginPassword corrispondente dalla route HTTP.
  client
    .start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () =>
        new Promise<string>((resolve, reject) => {
          pending.resolveCode = resolve;
          pending.rejectCode = reject;
        }),
      password: async () => {
        pending.awaitingPassword = true;
        return new Promise<string>((resolve, reject) => {
          pending.resolvePassword = resolve;
          pending.rejectPassword = reject;
        });
      },
      onError: (err) => {
        logger.error("[telegram-mtproto] errore durante il login", err);
        pending.failed = err?.message || String(err);
      },
    })
    .then(async () => {
      const sessionString = String(client.session.save());
      const encrypted = encryptCredential(sessionString)!;
      await prisma.telegramUserSession.upsert({
        where: { id: OWNER_SESSION_ID },
        update: { sessionString: encrypted, phoneNumber, updatedAt: new Date() },
        create: { id: OWNER_SESSION_ID, sessionString: encrypted, phoneNumber },
      });
      cachedClient = client; // riusa la connessione già aperta invece di riconnettersi
      pendingLogins.delete(phoneNumber);
      logger.info(`[telegram-mtproto] login MTProto completato per il numero terminante in ${phoneNumber.slice(-4)}`);
    })
    .catch((err) => {
      logger.error("[telegram-mtproto] login fallito", err);
      pending.failed = err?.message || String(err);
      pendingLogins.delete(phoneNumber);
    });

  return { status: "code_requested" };
}

export function submitLoginCode(phoneNumber: string, code: string) {
  const pending = pendingLogins.get(phoneNumber);
  if (!pending?.resolveCode) {
    throw new Error("Nessun login in corso per questo numero (o il codice è già stato inviato). Richiedi un nuovo codice.");
  }
  pending.resolveCode(code);
  pending.resolveCode = undefined;
}

export function submitLoginPassword(phoneNumber: string, password: string) {
  const pending = pendingLogins.get(phoneNumber);
  if (!pending?.resolvePassword) {
    throw new Error("Nessuna richiesta di password 2FA in corso per questo numero.");
  }
  pending.resolvePassword(password);
  pending.resolvePassword = undefined;
}

export type LoginStatus = "idle" | "awaiting_code" | "awaiting_password" | "connected" | "failed";

export async function getLoginStatus(phoneNumber: string): Promise<{ status: LoginStatus; error?: string }> {
  const pending = pendingLogins.get(phoneNumber);
  if (pending) {
    if (pending.failed) return { status: "failed", error: pending.failed };
    return { status: pending.awaitingPassword ? "awaiting_password" : "awaiting_code" };
  }
  const row = await prisma.telegramUserSession.findUnique({ where: { id: OWNER_SESSION_ID } });
  return { status: row ? "connected" : "idle" };
}

export async function isFolderSessionConnected(): Promise<boolean> {
  const row = await prisma.telegramUserSession.findUnique({ where: { id: OWNER_SESSION_ID } });
  return !!row;
}

export async function disconnectFolderSession(): Promise<void> {
  if (cachedClient) {
    try {
      await cachedClient.disconnect();
    } catch {
      /* noop */
    }
    cachedClient = null;
  }
  await prisma.telegramUserSession.deleteMany({ where: { id: OWNER_SESSION_ID } });
}

let cachedClient: TelegramClient | null = null;

async function getConnectedClient(): Promise<TelegramClient> {
  assertConfigured();
  if (cachedClient?.connected) return cachedClient;

  const row = await prisma.telegramUserSession.findUnique({ where: { id: OWNER_SESSION_ID } });
  if (!row) {
    throw new Error(
      "Nessuna sessione Telegram personale collegata. Completa il login MTProto una tantum dal pannello (tab Fan & Cartelle → Cartelle Telegram Reali)."
    );
  }

  const sessionString = decryptCredential(row.sessionString) || "";
  const client = new TelegramClient(new StringSession(sessionString), API_ID, API_HASH, {
    connectionRetries: 3,
  });
  await client.connect();
  cachedClient = client;
  return client;
}

export interface CreateTelegramFolderOptions {
  folderId: number; // ID univoco cartella (1-255, lato account Telegram dell'operatore)
  folderTitle: string; // Es. "Fan VIP", "Sexchat #1", "Clienti Attivi"
  includeChatIds: string[]; // chatId Telegram dei fan da inserire
}

export interface CreateFolderResult {
  created: boolean;
  includedCount: number;
  skippedChatIds: string[];
}

/**
 * Crea/aggiorna DAVVERO una cartella chat sull'account Telegram personale collegato,
 * chiamando Api.messages.UpdateDialogFilter via MTProto.
 *
 * NOTA IMPORTANTE: perché una chat possa essere inclusa in una cartella, l'account
 * Telegram collegato (quello dell'operatore/agenzia, non il bot) deve già avere quella
 * chat visibile nel suo elenco dialoghi — in pratica funziona per i fan con cui il
 * bot ha effettivamente scambiato messaggi e la cui chat esiste anche per l'account
 * userbot collegato (tipico se si usa lo stesso account per bot+userbot, o un
 * userbot aggiunto come admin/membro nelle chat rilevanti). Chat non risolvibili
 * vengono saltate e riportate in skippedChatIds invece di far fallire l'intera chiamata.
 */
export async function createOrUpdateRealFolder(options: CreateTelegramFolderOptions): Promise<CreateFolderResult> {
  const client = await getConnectedClient();

  const includePeers: Api.TypeInputPeer[] = [];
  const skippedChatIds: string[] = [];

  for (const chatId of options.includeChatIds) {
    try {
      const entity = await client.getInputEntity(chatId);
      includePeers.push(entity);
    } catch (err) {
      logger.warn(`[telegram-mtproto] chatId ${chatId} non risolvibile per la cartella (chat non visibile all'account userbot collegato), saltato`);
      skippedChatIds.push(chatId);
    }
  }

  await client.invoke(
    new Api.messages.UpdateDialogFilter({
      id: options.folderId,
      filter: new Api.DialogFilter({
        id: options.folderId,
        // Layer TL recenti richiedono TextWithEntities per il titolo, non una stringa semplice.
        title: new Api.TextWithEntities({ text: options.folderTitle, entities: [] }),
        pinnedPeers: [],
        includePeers,
        excludePeers: [],
        contacts: true,
        nonContacts: true,
        groups: false,
        broadcasts: false,
        bots: true,
      }),
    })
  );

  return { created: true, includedCount: includePeers.length, skippedChatIds };
}

/**
 * Alternativa senza login MTProto per i FAN (non serve al fan alcun account
 * "collegato"): genera un link ufficiale Telegram "Shareable Chat Folder"
 * (https://t.me/addlist/XXXXX). NB: il link deve prima essere creato per davvero
 * dall'app Telegram (Impostazioni → Cartelle → Condividi cartella) — questa funzione
 * si limita a costruire l'URL nel formato corretto per uno slug già esistente, non
 * crea la cartella condivisa lato Telegram (quello richiede comunque una chiamata
 * MTProto separata, Api.chatlists.ExportChatlistInvite, non ancora implementata qui).
 */
export function generateShareableFolderLink(folderSlug: string): string {
  return `https://t.me/addlist/${encodeURIComponent(folderSlug)}`;
}
