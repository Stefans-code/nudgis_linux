import { describe, it, expect } from "vitest";
import { computeFanHeatScore, blendHeatScore, signalFromScore } from "../sexchatHeat";

describe("computeFanHeatScore", () => {
  it("segnala 'hot' per messaggi con chiaro interesse/desiderio", () => {
    const result = computeFanHeatScore(["ciao", "sei bellissima 🔥", "voglio vederti, mandami qualcosa"]);
    expect(result.signal).toBe("hot");
    expect(result.score).toBeGreaterThan(0);
  });

  it("segnala 'cold' per rifiuti espliciti o sensibilità al prezzo", () => {
    const result = computeFanHeatScore(["ciao", "troppo caro per me", "non mi interessa, basta"]);
    expect(result.signal).toBe("cold");
    expect(result.score).toBeLessThan(0);
  });

  it("segnala 'neutral' per una conversazione generica senza segnali forti", () => {
    const result = computeFanHeatScore(["ciao", "come va la giornata", "tutto bene grazie"]);
    expect(result.signal).toBe("neutral");
  });

  it("pesa di più i messaggi più recenti", () => {
    // Stesso contenuto (un rifiuto e un interesse), ma in ordine diverso: l'ultimo messaggio pesa di più.
    const coldThenHot = computeFanHeatScore(["troppo caro, non mi interessa", "dai mandami il video, sei sexy 🔥"]);
    const hotThenCold = computeFanHeatScore(["dai mandami il video, sei sexy 🔥", "troppo caro, non mi interessa"]);
    expect(coldThenHot.score).toBeGreaterThan(hotThenCold.score);
  });

  it("gestisce un array vuoto senza errori", () => {
    const result = computeFanHeatScore([]);
    expect(result.signal).toBe("neutral");
    expect(result.score).toBe(0);
  });

  it("penalizza leggermente le risposte a basso coinvolgimento (monosillabi)", () => {
    const engaged = computeFanHeatScore(["che bella idea, raccontami di più per favore"]);
    const disengaged = computeFanHeatScore(["ok"]);
    expect(disengaged.score).toBeLessThan(engaged.score);
  });

  it("BUG FIX: una negazione davanti a una keyword di interesse non conta più come interesse", () => {
    const negated = computeFanHeatScore(["non voglio vedere altro, basta così"]);
    const affirmed = computeFanHeatScore(["voglio vedere altro"]);
    // "non voglio" deve pesare MENO (più freddo) di "voglio" senza negazione.
    expect(negated.score).toBeLessThan(affirmed.score);
    expect(negated.score).toBeLessThanOrEqual(0);
  });

  it("una negazione lontana dalla keyword (oltre la finestra di lookback) non la capovolge", () => {
    // "non" e "voglio" sono troppo distanti per essere collegati grammaticalmente.
    const result = computeFanHeatScore(["non è colpa mia se poi ovviamente voglio vederti comunque"]);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("blendHeatScore", () => {
  it("dà memoria alla storia: uno storico molto positivo attutisce un singolo messaggio freddo", () => {
    const strongHistory = 10; // fan interessato a lungo per molti messaggi precedenti
    const coldFreshMessage = -4; // ma l'ultimo messaggio è freddo
    const blended = blendHeatScore(strongHistory, coldFreshMessage);
    // Deve restare positivo (non ribaltato istantaneamente da un solo messaggio), grazie alla memoria.
    expect(blended).toBeGreaterThan(0);
  });

  it("uno storico neutro segue rapidamente un segnale fresco forte", () => {
    const blended = blendHeatScore(0, 8);
    expect(blended).toBeGreaterThan(0);
    expect(blended).toBeLessThan(8); // smorzato, non 1:1
  });
});

describe("signalFromScore", () => {
  it("classifica correttamente le tre fasce", () => {
    expect(signalFromScore(5)).toBe("hot");
    expect(signalFromScore(0)).toBe("neutral");
    expect(signalFromScore(-5)).toBe("cold");
  });
});
