import { describe, it, expect } from "vitest";
import { looksLikeFollowUpOptOut } from "../followUpOptOut";

describe("looksLikeFollowUpOptOut", () => {
  it("riconosce le formule di opt-out esplicito", () => {
    expect(looksLikeFollowUpOptOut("non scrivermi più per favore")).toBe(true);
    expect(looksLikeFollowUpOptOut("/stop")).toBe(true);
    expect(looksLikeFollowUpOptOut("basta messaggi grazie")).toBe(true);
  });

  it("è case-insensitive", () => {
    expect(looksLikeFollowUpOptOut("NON SCRIVERMI PIÙ")).toBe(true);
  });

  it("non fa match su un messaggio normale", () => {
    expect(looksLikeFollowUpOptOut("ciao come va oggi?")).toBe(false);
    expect(looksLikeFollowUpOptOut("mi piacerebbe vederti")).toBe(false);
  });
});
