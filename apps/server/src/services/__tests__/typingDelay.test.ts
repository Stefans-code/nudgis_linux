import { describe, it, expect, vi, afterEach } from "vitest";
import { computeTypingDelayMs } from "../typingDelay";

describe("computeTypingDelayMs", () => {
  afterEach(() => vi.useRealTimers());

  it("resta entro il minimo e il massimo configurati per un testo vuoto", () => {
    const delay = computeTypingDelayMs("");
    expect(delay).toBeGreaterThanOrEqual(800);
    expect(delay).toBeLessThanOrEqual(12000 * 1.4); // margine per il moltiplicatore notturno
  });

  it("aumenta il ritardo per testi più lunghi (di giorno)", () => {
    vi.setSystemTime(new Date("2026-01-01T12:00:00"));
    const short = computeTypingDelayMs("ciao");
    const long = computeTypingDelayMs("a".repeat(500));
    expect(long).toBeGreaterThan(short);
  });

  it("non supera mai il massimo assoluto anche per testi lunghissimi", () => {
    vi.setSystemTime(new Date("2026-01-01T03:00:00")); // notte, +40%
    const delay = computeTypingDelayMs("a".repeat(5000));
    expect(delay).toBeLessThanOrEqual(Math.round(12000 * 1.4));
  });

  it("applica un moltiplicatore notturno maggiore rispetto al giorno", () => {
    const dayDelays: number[] = [];
    const nightDelays: number[] = [];
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(new Date("2026-01-01T12:00:00"));
      dayDelays.push(computeTypingDelayMs("a".repeat(300)));
      vi.setSystemTime(new Date("2026-01-01T02:00:00"));
      nightDelays.push(computeTypingDelayMs("a".repeat(300)));
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(nightDelays)).toBeGreaterThan(avg(dayDelays));
  });
});
