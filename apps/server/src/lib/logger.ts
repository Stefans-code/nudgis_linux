/**
 * Logger Sicuro Sanitizzato: rimuove token Telegram e API Key prima di stampare gli errori nei log.
 */
export function sanitizeLogText(message: string): string {
  if (!message) return "";
  return message
    .replace(/(sk-[a-zA-Z0-9_-]{20,})/g, "sk-****[REDACTED]")
    .replace(/([0-9]{8,11}:[a-zA-Z0-9_-]{30,})/g, "[BOT_TOKEN_REDACTED]")
    .replace(/(enc:[a-f0-9:]+)/g, "[ENCRYPTED_DATA_REDACTED]");
}

export const logger = {
  info: (msg: string, ...args: any[]) => console.log(sanitizeLogText(msg), ...args),
  warn: (msg: string, ...args: any[]) => console.warn(sanitizeLogText(msg), ...args),
  error: (msg: string, err?: any) => {
    const errText = err?.message || String(err || "");
    console.error(sanitizeLogText(`${msg} - ${errText}`));
  },
};
