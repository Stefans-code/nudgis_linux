import { describe, it, expect } from "vitest";
import { parseSqlStatements } from "../autoMigrate";

describe("parseSqlStatements", () => {
  it("estrae un singolo statement senza commenti", () => {
    const sql = `CREATE TABLE "Foo" ("id" TEXT PRIMARY KEY);`;
    expect(parseSqlStatements(sql)).toEqual([`CREATE TABLE "Foo" ("id" TEXT PRIMARY KEY)`]);
  });

  it("ignora righe di commento che precedono uno statement sulla riga successiva", () => {
    // Caso REALE del bug: un commento multi-riga di Prisma seguito da un ALTER TABLE
    // sulla riga dopo veniva scartato interamente dal vecchio parsing (split ingenuo
    // per ";" che considerava "attaccato" tutto il blocco commento+statement).
    const sql = [
      "-- AlterTable",
      '-- Aggiunge il campo llmProvider a "Creator"',
      'ALTER TABLE "Creator" ADD COLUMN "llmProvider" TEXT NOT NULL DEFAULT \'ollama\';',
    ].join("\n");

    const statements = parseSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('ALTER TABLE "Creator" ADD COLUMN "llmProvider"');
  });

  it("gestisce più migrazioni statement con commenti intermezzati", () => {
    const sql = [
      "-- CreateTable",
      'CREATE TABLE "A" ("id" TEXT PRIMARY KEY);',
      "-- CreateIndex",
      'CREATE UNIQUE INDEX "A_id_key" ON "A"("id");',
    ].join("\n");

    const statements = parseSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE "A"');
    expect(statements[1]).toContain('CREATE UNIQUE INDEX "A_id_key"');
  });

  it("ignora righe vuote e statement vuoti risultanti", () => {
    const sql = `\n\n-- solo commento, nessuno statement\n\n`;
    expect(parseSqlStatements(sql)).toEqual([]);
  });

  it("non tronca uno statement quando il commento è su una riga indentata", () => {
    const sql = [
      "  -- commento indentato",
      'CREATE TABLE "B" ("id" TEXT PRIMARY KEY);',
    ].join("\n");
    const statements = parseSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('CREATE TABLE "B"');
  });
});
