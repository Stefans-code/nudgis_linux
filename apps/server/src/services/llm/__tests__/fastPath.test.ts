import { describe, it, expect } from "vitest";
import { checkFastPathMatch } from "../fastPath";

describe("checkFastPathMatch", () => {
  it("intercetta la richiesta del link di pagamento", () => {
    expect(checkFastPathMatch("dove pago?").matched).toBe(true);
    expect(checkFastPathMatch("Come Pago").matched).toBe(true);
    expect(checkFastPathMatch("mandami il link tribute").matched).toBe(true);
  });

  it("intercetta la dichiarazione di pagamento effettuato", () => {
    const result = checkFastPathMatch("ciao ho pagato ora!");
    expect(result.matched).toBe(true);
    expect(result.replyText).toBeTruthy();
  });

  it("non fa match su un messaggio generico", () => {
    expect(checkFastPathMatch("ciao come stai oggi?").matched).toBe(false);
  });

  it("è case-insensitive e tollera spazi ai bordi", () => {
    expect(checkFastPathMatch("  LINK  ").matched).toBe(true);
    expect(checkFastPathMatch("DOVE PAGO").matched).toBe(true);
  });
});
