import { defineConfig } from "vitest/config";
import path from "path";

// I test di integrazione (sexchatStateMachine.integration.test.ts) girano contro un
// vero DB SQLite di test, separato da dev.db: niente mock del Prisma Client, la logica
// di persistenza/escalation è verificata per davvero end-to-end.
// NB: lo stesso valore è duplicato in src/test/globalSetup.ts (non importato da qui
// apposta, per non rompere "npm run build" — vedi commento in quel file).
const TEST_DATABASE_URL = `file:${path.resolve(__dirname, "prisma/test.db")}`;

export default defineConfig({
  test: {
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: "./src/test/globalSetup.ts",
  },
});
