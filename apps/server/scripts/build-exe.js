// Build dell'eseguibile Nugis (server + pannello web in un unico binario) per una
// piattaforma a scelta (Windows/Linux/macOS, x64/arm64).
//
// Uso:
//   npm run build:exe -w apps/server                       (default: Windows x64, invariato)
//   PKG_TARGET=node22-linux-x64   OUT_DIR=dist-exe-linux-x64   node scripts/build-exe.js
//   PKG_TARGET=node22-linux-arm64 OUT_DIR=dist-exe-linux-arm64 node scripts/build-exe.js
//   PKG_TARGET=node22-macos-x64   OUT_DIR=dist-exe-macos-x64   node scripts/build-exe.js
//   PKG_TARGET=node22-macos-arm64 OUT_DIR=dist-exe-macos-arm64 node scripts/build-exe.js
//
// Output: apps/server/<OUT_DIR>/
//   Nugis(.exe)               <- avvialo per far partire tutto
//   public/                   <- build statica del pannello web, servita dallo stesso binario
//   generated/prisma-client/  <- client Prisma + motori nativi per TUTTE le piattaforme
//                                target (vedi prisma/schema.prisma binaryTargets) — non
//                                impacchettabili nel binario da pkg
//   prisma/migrations/        <- migrazioni, applicate automaticamente all'avvio
//   .env.example              <- da copiare in ".env" e compilare prima del primo avvio
//
// NB: non è un singolo file autosufficiente al 100% — Prisma richiede un motore nativo
// (query engine) che pkg non può fondere dentro il binario. È normale per applicazioni
// Node.js pacchettizzate: si distribuisce una cartella, non un unico file, esattamente
// come fanno molti tool a riga di comando basati su Node.
//
// Cross-building: pkg scarica un binario Node precompilato per il target richiesto,
// quindi si può costruire un eseguibile Linux/macOS anche da Windows (e viceversa) —
// NON serve la macchina finale per produrre il binario. Serve però quella macchina
// (o una VM/CI con quel sistema operativo) per TESTARE che parta davvero: un
// cross-build non garantisce da solo che il binario giri sull'OS di destinazione.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = path.resolve(SERVER_ROOT, "..", "web");

const PKG_TARGET = process.env.PKG_TARGET || "node22-win-x64";
const IS_WIN = PKG_TARGET.includes("win");
const BIN_NAME = process.env.BIN_NAME || (IS_WIN ? "Nugis.exe" : "Nugis");
const OUT_DIR = path.join(SERVER_ROOT, process.env.OUT_DIR || "dist-exe");
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

console.log(`Target pkg: ${PKG_TARGET}  ->  ${OUT_DIR}/${BIN_NAME}`);

console.log("=== 1/6: pulizia build precedente ===");
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("=== 2/6: build del pannello web (origine relativa, stesso processo del server) ===");
run("npx vite build", WEB_ROOT, { VITE_API_URL: "" });

console.log("=== 3/6: generazione client Prisma (tutte le piattaforme, vedi schema.prisma binaryTargets) ===");
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

console.log(`=== 6/6: pacchettizzazione con pkg (${PKG_TARGET}) ===`);
run(`npx pkg dist/index.js --targets ${PKG_TARGET} --output "${path.join(OUT_DIR, BIN_NAME)}"`, SERVER_ROOT);

console.log("Copia risorse esterne accanto al binario (Prisma non è impacchettabile in un singolo file)...");
copyDir(path.join(SERVER_ROOT, "src/generated/prisma-client"), path.join(OUT_DIR, "generated/prisma-client"));

// Il client generato porta i motori nativi di TUTTE le piattaforme (vedi schema.prisma
// binaryTargets), utile mentre si sviluppa/genera una volta sola, ma inutile (e pesante,
// ~15-30MB a motore) da spedire dentro il pacchetto di UNA piattaforma sola. Teniamo solo
// i motori rilevanti per questo target, cancelliamo gli altri.
const ENGINE_KEEP_PATTERNS = {
  win: [/^query_engine-windows\.dll\.node$/],
  "linux-x64": [/^libquery_engine-debian-openssl-3\.0\.x\.so\.node$/, /^libquery_engine-debian-openssl-1\.1\.x\.so\.node$/, /^libquery_engine-linux-musl\.so\.node$/],
  "linux-arm64": [/^libquery_engine-linux-arm64-openssl-3\.0\.x\.so\.node$/, /^libquery_engine-linux-musl-arm64-openssl-3\.0\.x\.so\.node$/],
  "macos-x64": [/^libquery_engine-darwin\.dylib\.node$/],
  "macos-arm64": [/^libquery_engine-darwin-arm64\.dylib\.node$/],
};
function platformKeyFor(target) {
  if (target.includes("win")) return "win";
  if (target.includes("linux") && target.includes("arm64")) return "linux-arm64";
  if (target.includes("linux")) return "linux-x64";
  if (target.includes("macos") && target.includes("arm64")) return "macos-arm64";
  if (target.includes("macos")) return "macos-x64";
  return null;
}
const keepPatterns = ENGINE_KEEP_PATTERNS[platformKeyFor(PKG_TARGET)];
if (keepPatterns) {
  const engineDir = path.join(OUT_DIR, "generated/prisma-client");
  for (const entry of fs.readdirSync(engineDir)) {
    const isEngineFile = /query_engine-.*\.node$/.test(entry);
    if (isEngineFile && !keepPatterns.some((re) => re.test(entry))) {
      fs.rmSync(path.join(engineDir, entry));
    }
  }
}
copyDir(path.join(SERVER_ROOT, "prisma/migrations"), path.join(OUT_DIR, "prisma/migrations"));
fs.copyFileSync(path.join(SERVER_ROOT, "prisma/schema.prisma"), path.join(OUT_DIR, "prisma/schema.prisma"));
copyDir(path.join(WEB_ROOT, "dist"), path.join(OUT_DIR, "public"));
fs.copyFileSync(path.join(SERVER_ROOT, ".env.example"), path.join(OUT_DIR, ".env.example"));

if (!IS_WIN) {
  // pkg non porta sempre il bit eseguibile su binari cross-built da Windows.
  try {
    fs.chmodSync(path.join(OUT_DIR, BIN_NAME), 0o755);
  } catch {
    /* ignorato su piattaforme dove chmod non ha senso (es. build da Windows per Linux/macOS) */
  }
}

console.log(`\n✅ Fatto. Eseguibile e risorse in: ${OUT_DIR}`);
console.log(`   Prima del primo avvio: copia .env.example in .env dentro ${path.basename(OUT_DIR)}/ e compilalo.`);
