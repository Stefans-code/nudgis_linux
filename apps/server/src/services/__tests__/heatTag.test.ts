import { describe, it, expect } from "vitest";
import { extractHeatTag, heatTagToScore } from "../heatTag";

describe("extractHeatTag", () => {
  it("estrae i tre tag quando sono tutti presenti in fondo al messaggio", () => {
    const raw = "Ciao tesoro, come va? 😊\n[[HEAT:hot]] [[PAYMENT_CLAIM:no]] [[OPTOUT:no]]";
    const { cleanedText, llmHeatSignal, llmPaymentClaimSignal, llmOptOutSignal } = extractHeatTag(raw);
    expect(llmHeatSignal).toBe("hot");
    expect(llmPaymentClaimSignal).toBe("no");
    expect(llmOptOutSignal).toBe("no");
    expect(cleanedText).toBe("Ciao tesoro, come va? 😊");
    expect(cleanedText).not.toContain("HEAT");
  });

  it("è case-insensitive e tollera spazi extra nei tag", () => {
    const raw = "Ok! [[ heat: COLD ]] [[ PAYMENT_CLAIM : YES ]] [[optout:YES]]";
    const { llmHeatSignal, llmPaymentClaimSignal, llmOptOutSignal } = extractHeatTag(raw);
    expect(llmHeatSignal).toBe("cold");
    expect(llmPaymentClaimSignal).toBe("yes");
    expect(llmOptOutSignal).toBe("yes");
  });

  it("trova e rimuove i tag anche se il modello non li mette in fondo o in ordine sparso", () => {
    const raw = "Prima parte [[PAYMENT_CLAIM:yes]] e poi [[HEAT:neutral]] il resto del messaggio.";
    const { cleanedText, llmHeatSignal, llmPaymentClaimSignal } = extractHeatTag(raw);
    expect(llmHeatSignal).toBe("neutral");
    expect(llmPaymentClaimSignal).toBe("yes");
    expect(cleanedText).not.toContain("HEAT");
    expect(cleanedText).not.toContain("PAYMENT_CLAIM");
    expect(cleanedText).toContain("Prima parte");
    expect(cleanedText).toContain("resto del messaggio");
  });

  it("restituisce null per i tag assenti (non deve mai bloccare la risposta)", () => {
    const raw = "Ciao, come stai oggi?";
    const result = extractHeatTag(raw);
    expect(result.llmHeatSignal).toBeNull();
    expect(result.llmPaymentClaimSignal).toBeNull();
    expect(result.llmOptOutSignal).toBeNull();
    expect(result.cleanedText).toBe(raw);
  });

  it("non lascia mai tag visibili nel testo pulito, qualunque sia l'input", () => {
    const inputs = [
      "testo [[HEAT:hot]] [[PAYMENT_CLAIM:no]] [[OPTOUT:no]]",
      "[[OPTOUT:yes]] testo",
      "testo [[HEAT:neutral]] con [[HEAT:hot]] doppio tag",
      "testo normale senza tag",
    ];
    for (const raw of inputs) {
      const { cleanedText } = extractHeatTag(raw);
      const lower = cleanedText.toLowerCase();
      expect(lower).not.toContain("[[heat");
      expect(lower).not.toContain("[[payment_claim");
      expect(lower).not.toContain("[[optout");
    }
  });

  it("gestisce l'estrazione anche se solo alcuni tag sono presenti", () => {
    const raw = "Messaggio con solo il tag opt-out. [[OPTOUT:yes]]";
    const result = extractHeatTag(raw);
    expect(result.llmOptOutSignal).toBe("yes");
    expect(result.llmHeatSignal).toBeNull();
    expect(result.llmPaymentClaimSignal).toBeNull();
  });
});

describe("heatTagToScore", () => {
  it("mappa i segnali nei punteggi attesi", () => {
    expect(heatTagToScore("hot")).toBeGreaterThan(0);
    expect(heatTagToScore("cold")).toBeLessThan(0);
    expect(heatTagToScore("neutral")).toBe(0);
  });
});
