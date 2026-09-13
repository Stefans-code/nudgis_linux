import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
// BUG FIX: AES-256-GCM richiede una chiave di ESATTAMENTE 32 byte. Prima, se
// ENCRYPTION_KEY era impostata nel .env con una stringa qualsiasi (come suggerito
// dal commento "una stringa lunga e casuale"), createCipheriv falliva con
// "Invalid key length" a meno che la stringa non fosse per puro caso lunga 32
// caratteri esatti — solo il fallback (quando ENCRYPTION_KEY è vuota) passava
// da sha256 e quindi funzionava sempre. Ora entrambi i percorsi passano da sha256,
// così qualunque valore di ENCRYPTION_KEY (di qualsiasi lunghezza) produce una
// chiave valida a 32 byte.
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || process.env.ADMIN_JWT_SECRET || "default_fallback_secret_32_bytes_long!!")
  .digest();

/**
 * Cifra credenziali sensibili (API Key, Token Telegram) at-rest prima del salvataggio nel Database.
 */
export function encryptCredential(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  if (text.startsWith("enc:")) return text; // Già cifrato

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decifra credenziali sensibili dal Database per l'utilizzo interno nell'LLM o Bot Telegram.
 */
export function decryptCredential(encryptedText: string | null | undefined): string | null {
  if (!encryptedText || !encryptedText.trim()) return null;
  if (!encryptedText.startsWith("enc:")) return encryptedText; // Stringa in chiaro (legacy)

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 4) return encryptedText;

    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encrypted = parts[3];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[crypto] Impossibile decifrare credenziale at-rest:", err);
    return null;
  }
}

/**
 * Genera una versione mascherata per l'output frontend (es. sk-****44c9 o 7094****AAH).
 */
export function maskCredential(text: string | null | undefined): { hasCredential: boolean; masked: string } {
  if (!text || !text.trim()) {
    return { hasCredential: false, masked: "" };
  }

  const raw = decryptCredential(text) || text;
  if (raw.length <= 8) {
    return { hasCredential: true, masked: "****" };
  }

  const start = raw.substring(0, 4);
  const end = raw.substring(raw.length - 4);
  return { hasCredential: true, masked: `${start}****${end}` };
}
