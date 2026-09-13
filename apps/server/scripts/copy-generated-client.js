// BUG FIX: "tsc" compila SOLO i file .ts — il client Prisma generato (src/generated/
// prisma-client/) è già JavaScript puro, quindi tsc lo ignora e non lo copia mai in
// dist/. Senza questo script, "node dist/index.js" (e di conseguenza anche l'exe
// pacchettizzato con pkg, che parte dalla stessa dist/) falliva con
// "Cannot find module '../generated/prisma-client'" — scoperto testando DAVVERO
// l'eseguibile, non solo compilando. Vedi anche prisma/schema.prisma per il perché
// del path "generated" invece del pacchetto "@prisma/client" condiviso.

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "generated", "prisma-client");
const DEST = path.join(__dirname, "..", "dist", "generated", "prisma-client");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`[copy-generated-client] ${SRC} non esiste — esegui "npx prisma generate" prima della build.`);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);
console.log(`[copy-generated-client] Copiato client Prisma generato in ${DEST}`);
