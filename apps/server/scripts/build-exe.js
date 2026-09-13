// Build dell'eseguibile Windows di Nugis (server + pannello web in un unico .exe).
// Uso: npm run build:exe -w apps/server
//
// Output: apps/server/dist-exe/
//   Nugis.exe                 <- avvialo per far partire tutto
//   public/                   <- build statica del pannello web, servita dallo stesso .exe
//   generated/prisma-client/  <- client Prisma + motore nativo (non impacchettabile nel binario)
//   prisma/migrations/        <- migrazioni, applicate automaticamente all'avvio
//   .env.example              <- da copiare in ".env" e compilare prima del primo avvio
//
// NB: non è un singolo file autosufficiente al 100% — Prisma richiede un motore nativo
// (query engine) che pkg non può fondere dentro il binario. È normale per applicazioni
// Node.js pacchettizzate: si distribuisce una cartella, non un unico file, esattamente
// come fanno molti tool a riga di comando basati su Node.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = path.resolve(SERVER_ROOT, "..", "web");
const OUT_DIR = path.join(SERVER_ROOT, "dist-exe");
const OBFUSCATE = process.env.SKIP_OBFUSCATE !== "1"; // SKIP_OBFUSCATE=1 per build di debug più veloci

function run(cmd, cwd, env) {
  console.log(`\n$ ${cmd}  (in ${cwd})`);
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log("=== 1/6: pulizia build precedente ===");
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("=== 2/6: build del pannello web (origine relativa, stesso processo del server) ===");
run("npx vite build", WEB_ROOT, { VITE_API_URL: "" });

console.log("=== 3/6: generazione client Prisma (se non già presente) ===");
if (!fs.existsSync(path.join(SERVER_ROOT, "src/generated/prisma-client"))) {
  run("npx prisma generate", SERVER_ROOT);
}

console.log("=== 4/6: build del server (TypeScript -> JS) + copia client Prisma in dist/ ===");
run("npm run build", SERVER_ROOT); // tsc + scripts/copy-generated-client.js (vedi package.json)

if (OBFUSCATE) {
  console.log("=== 5/6: offuscamento del codice compilato (dist/) ===");
  const JavaScriptObfuscator = require("javascript-obfuscator");
  const distDir = path.join(SERVER_ROOT, "dist");

  function obfuscateDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        obfuscateDir(full);
      } else if (entry.name.endsWith(".js")) {
        const code = fs.readFileSync(full, "utf8");
        const result = JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.3,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          identifierNamesGenerator: "hexadecimal",
          renameGlobals: false, // richiesto da Node/CommonJS (require, module, exports)
          selfDefending: true,
        });
        fs.writeFileSync(full, result.getObfuscatedCode());
      }
    }
  }
  obfuscateDir(distDir);
} else {
  console.log("=== 5/6: offuscamento SALTATO (SKIP_OBFUSCATE=1) ===");
}

console.log("=== 6/6: pacchettizzazione con pkg ===");
run(`npx pkg dist/index.js --targets node22-win-x64 --output "${path.join(OUT_DIR, "Nugis.exe")}"`, SERVER_ROOT);

console.log("Copia risorse esterne accanto all'exe (Prisma non è impacchettabile in un singolo binario)...");
copyDir(path.join(SERVER_ROOT, "src/generated/prisma-client"), path.join(OUT_DIR, "generated/prisma-client"));
copyDir(path.join(SERVER_ROOT, "prisma/migrations"), path.join(OUT_DIR, "prisma/migrations"));
fs.copyFileSync(path.join(SERVER_ROOT, "prisma/schema.prisma"), path.join(OUT_DIR, "prisma/schema.prisma"));
copyDir(path.join(WEB_ROOT, "dist"), path.join(OUT_DIR, "public"));
fs.copyFileSync(path.join(SERVER_ROOT, ".env.example"), path.join(OUT_DIR, ".env.example"));

console.log(`\n✅ Fatto. Eseguibile e risorse in: ${OUT_DIR}`);
console.log(`   Prima del primo avvio: copia .env.example in .env dentro dist-exe/ e compilalo.`);
