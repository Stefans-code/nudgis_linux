import path from "path";

/**
 * Percorsi "veri" a runtime, che funzionano sia in sviluppo normale, sia dentro Docker,
 * sia dentro l'eseguibile pacchettizzato con pkg — dove il filesystem interno allo
 * snapshot è di SOLA LETTURA (`__dirname`-relative non funziona per percorsi
 * scrivibili: "Cannot mkdir in a snapshot", scoperto testando l'exe per davvero).
 */
export function isPkgExe(): boolean {
  return !!(process as any).pkg;
}

/** Cartella base "reale" sul disco: quella dell'exe se pacchettizzato, altrimenti la radice di apps/server. */
export function getAppBaseDir(): string {
  if (isPkgExe()) return path.dirname(process.execPath);
  // lib/paths.ts compilato in dist/lib/paths.js -> due livelli sopra è apps/server.
  return path.resolve(__dirname, "..", "..");
}

/**
 * Risolve il file SQLite indicato da DATABASE_URL in un percorso assoluto reale.
 * Un path assoluto (Docker/.exe, dove lo impostiamo sempre così apposta) viene usato
 * direttamente. Un path relativo (dev locale, es. "file:./prisma/dev.db") viene
 * risolto rispetto alla cartella prisma/ — la STESSA convenzione che usa Prisma
 * stesso per interpretare i path relativi in DATABASE_URL (relativi alla posizione di
 * schema.prisma, non alla cwd del processo).
 */
export function resolveSqliteFilePath(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return null;

  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath) || /^[a-zA-Z]:[\\/]/.test(filePath)) {
    return filePath;
  }
  return path.resolve(getAppBaseDir(), "prisma", filePath);
}
