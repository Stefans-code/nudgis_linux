import { describe, it, expect } from "vitest";
import { scoreContentItems, ScorableContentItem } from "../contentMatcher";

const items: ScorableContentItem[] = [
  {
    id: "1",
    externalId: "21670210",
    folder: "Sexchat #3",
    title: "Video di coppia supermercato",
    description: "descrizione video coppia",
    priceCents: 10000,
    currency: "EUR",
  },
  {
    id: "2",
    externalId: "999111",
    folder: "Foto Live Piedi",
    title: "Foto piedi personalizzate",
    description: "foto piedi su richiesta",
    priceCents: 1500,
    currency: "EUR",
  },
  {
    id: "3",
    externalId: "555222",
    folder: "generico",
    title: "Contenuto vario",
    description: "",
    priceCents: 500,
    currency: "EUR",
  },
];

describe("scoreContentItems", () => {
  it("dà il punteggio più alto per un match esatto sull'ID esterno", () => {
    const scored = scoreContentItems(items, "voglio il video con ID 21670210");
    expect(scored[0].item.id).toBe("1");
    expect(scored[0].score).toBeGreaterThanOrEqual(100);
  });

  it("riconosce una richiesta tematica (es. piedi) tramite cartella/titolo", () => {
    const scored = scoreContentItems(items, "hai delle foto dei piedi da mandarmi?");
    expect(scored[0].item.id).toBe("2");
    expect(scored[0].score).toBeGreaterThan(0);
  });

  it("riconosce la richiesta del video di coppia", () => {
    const scored = scoreContentItems(items, "parlami del video di coppia");
    expect(scored[0].item.id).toBe("1");
  });

  it("restituisce punteggio 0 per tutti quando il messaggio non c'entra nulla", () => {
    const scored = scoreContentItems(items, "che tempo fa oggi?");
    expect(scored.every((s) => s.score === 0)).toBe(true);
  });

  it("mantiene l'ordine per punteggio decrescente", () => {
    const scored = scoreContentItems(items, "video coppia piedi");
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it("gestisce un catalogo vuoto senza errori", () => {
    expect(scoreContentItems([], "ciao")).toEqual([]);
  });
});
