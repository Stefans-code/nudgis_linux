import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const TEST_DB_PATH = path.resolve(__dirname, "../../prisma/test.db");
const SERVER_ROOT = path.resolve(__dirname, "../..");
// NB: duplicato (non importato) da vitest.config.ts di proposito — quel file vive fuori
// da "src" (rootDir del tsconfig di produzione), importarlo da qui romperebbe "npm run
// build" (tsc -p tsconfig.json) che include solo file dentro src/.
const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

/**
 * Prepara un DB SQLite di test pulito (separato da dev.db) applicando le migrazioni
 * reali, prima di eseguire i test di integrazione. Così i test contro la state machine
 * sexchat verificano la logica REALE di persistenza (Prisma + SQLite), non un mock.
 */
export async function setup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = TEST_DB_PATH + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  execSync("npx prisma migrate deploy", {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}

export async function teardown() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = TEST_DB_PATH + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
