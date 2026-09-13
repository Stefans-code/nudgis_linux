import { describe, it, expect } from "vitest";
import { looksLikeExternalPaymentClaim } from "../paymentClaims";

describe("looksLikeExternalPaymentClaim", () => {
  it("riconosce le dichiarazioni comuni di pagamento esterno", () => {
    expect(looksLikeExternalPaymentClaim("ti ho appena mandato i soldi su paypal")).toBe(true);
    expect(looksLikeExternalPaymentClaim("ho fatto il bonifico ieri")).toBe(true);
    expect(looksLikeExternalPaymentClaim("pagamento fatto, controlla")).toBe(true);
  });

  it("è case-insensitive", () => {
    expect(looksLikeExternalPaymentClaim("HO GIÀ PAGATO")).toBe(true);
  });

  it("non fa match su un messaggio che non parla di pagamenti", () => {
    expect(looksLikeExternalPaymentClaim("ciao bella giornata oggi")).toBe(false);
  });
});
