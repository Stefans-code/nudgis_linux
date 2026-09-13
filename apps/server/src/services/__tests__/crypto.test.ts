import { describe, it, expect, beforeAll } from "vitest";

// ENCRYPTION_KEY va impostata PRIMA di importare il modulo (è letta al top-level).
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-for-vitest-32b";
});

describe("crypto (encryptCredential / decryptCredential / maskCredential)", () => {
  it("cifra e decifra un valore in modo round-trip", async () => {
    const { encryptCredential, decryptCredential } = await import("../crypto");
    const original = "sk-e70b7-super-secret-api-key";
    const encrypted = encryptCredential(original);
    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toBe(original);
    expect(encrypted!.startsWith("enc:")).toBe(true);

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(original);
  });

  it("restituisce null per input vuoto/nullo", async () => {
    const { encryptCredential } = await import("../crypto");
    expect(encryptCredential(null)).toBeNull();
    expect(encryptCredential(undefined)).toBeNull();
    expect(encryptCredential("")).toBeNull();
  });

  it("non ricifra un valore già cifrato (idempotenza)", async () => {
    const { encryptCredential } = await import("../crypto");
    const once = encryptCredential("valore-originale")!;
    const twice = encryptCredential(once);
    expect(twice).toBe(once);
  });

  it("tratta un valore in chiaro pre-esistente (legacy, senza prefisso enc:) come già leggibile", async () => {
    const { decryptCredential } = await import("../crypto");
    expect(decryptCredential("token-in-chiaro-legacy")).toBe("token-in-chiaro-legacy");
  });

  it("maschera mostrando solo inizio/fine, mai il valore completo", async () => {
    const { encryptCredential, maskCredential } = await import("../crypto");
    const original = "sk-e70b71234567890abcdef";
    const encrypted = encryptCredential(original)!;
    const { hasCredential, masked } = maskCredential(encrypted);

    expect(hasCredential).toBe(true);
    expect(masked).toContain("****");
    expect(masked).not.toContain(original);
    expect(masked.startsWith(original.slice(0, 4))).toBe(true);
    expect(masked.endsWith(original.slice(-4))).toBe(true);
  });

  it("segnala hasCredential=false quando non c'è nulla da mascherare", async () => {
    const { maskCredential } = await import("../crypto");
    expect(maskCredential(null).hasCredential).toBe(false);
    expect(maskCredential("").hasCredential).toBe(false);
  });
});
