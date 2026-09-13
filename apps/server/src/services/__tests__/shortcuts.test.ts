import { describe, it, expect } from "vitest";
import { expandShortcuts, buildShortcutsInstruction, ShortcutDef } from "../shortcuts";

const shortcuts: ShortcutDef[] = [
  { command: "/listino", content: "5 min: 30€, 10 min: 40€, 15 min: 60€" },
  { command: "/tribute", content: "Paga qui: https://t.me/tribute/app?startapp=dMY7" },
];

describe("expandShortcuts", () => {
  it("estrae il comando su riga propria e lo sostituisce col contenuto salvato", () => {
    const raw = "Ciao tesoro!\n/listino\nFammi sapere cosa ti piace 😊";
    const { mainText, expansions } = expandShortcuts(raw, shortcuts);

    expect(expansions).toEqual(["5 min: 30€, 10 min: 40€, 15 min: 60€"]);
    expect(mainText).not.toContain("/listino");
    expect(mainText).toContain("Ciao tesoro!");
    expect(mainText).toContain("Fammi sapere");
  });

  it("gestisce più comandi nello stesso messaggio, in ordine", () => {
    const raw = "/listino\n/tribute";
    const { expansions } = expandShortcuts(raw, shortcuts);
    expect(expansions).toEqual([shortcuts[0].content, shortcuts[1].content]);
  });

  it("non tocca un comando non riconosciuto", () => {
    const raw = "Prova /nonesiste qui";
    const { mainText, expansions } = expandShortcuts(raw, shortcuts);
    expect(expansions).toHaveLength(0);
    expect(mainText).toBe(raw);
  });

  it("è case-insensitive sul comando", () => {
    const raw = "/LISTINO";
    const { expansions } = expandShortcuts(raw, shortcuts);
    expect(expansions).toEqual([shortcuts[0].content]);
  });

  it("un comando in mezzo a una frase (non su riga propria) non viene espanso", () => {
    // Il comando deve essere isolato sulla sua riga, non uno slash a caso nel testo.
    const raw = "Guarda il mio /listino qui sotto";
    const { expansions } = expandShortcuts(raw, shortcuts);
    expect(expansions).toHaveLength(0);
  });

  it("gestisce liste vuote di shortcut senza errori", () => {
    const result = expandShortcuts("qualsiasi testo", []);
    expect(result).toEqual({ mainText: "qualsiasi testo", expansions: [] });
  });
});

describe("buildShortcutsInstruction", () => {
  it("restituisce stringa vuota se non ci sono shortcut", () => {
    expect(buildShortcutsInstruction([])).toBe("");
  });

  it("elenca tutti i comandi disponibili", () => {
    const instruction = buildShortcutsInstruction(shortcuts);
    expect(instruction).toContain("/listino");
    expect(instruction).toContain("/tribute");
  });
});
