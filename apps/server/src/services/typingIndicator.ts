import { Context } from "grammy";
import { logger } from "../lib/logger";

/**
 * Mostra subito l'indicatore "sta scrivendo..." di Telegram appena arriva il messaggio,
 * invece di far aspettare il fan in silenzio per tutta la durata della generazione LLM
 * (brief pagina 1: "maggiore velocità" / "tempo di risposta realistico"). Il typing
 * indicator nativo di Telegram scade dopo ~5s, quindi va rinnovato periodicamente
 * finché la risposta non è pronta.
 *
 * Non è streaming vero dei token (Telegram non supporta bene l'editing continuo di un
 * messaggio come UX — editare il messaggio a raffica assomiglierebbe più a spam che a
 * un miglioramento, e costerebbe altre chiamate API), ma è il modo idiomatico Telegram
 * di comunicare "sto scrivendo" fin da subito, riducendo l'attesa percepita.
 */
export function startTypingIndicator(ctx: Context): () => void {
  let stopped = false;

  const send = () => {
    if (stopped) return;
    ctx.replyWithChatAction("typing").catch((err) => {
      logger.warn(`[typing-indicator] impossibile inviare chat action: ${err?.message ?? err}`);
    });
  };

  send(); // subito, non aspettare il primo tick
  const interval = setInterval(send, 4000);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
