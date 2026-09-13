// Builda l'exe (build-exe.js) e poi lo pacchettizza in un installer Windows unico
// (NugisSetup.exe) con Inno Setup: wizard per email/password admin + licenza,
// generazione automatica di .env, registrazione di un'attività pianificata per
// l'avvio automatico. Vedi installer/nugis.iss per i dettagli.
//
// Uso: npm run build:installer -w apps/server
// Richiede Inno Setup 6 installato (ISCC.exe).

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const ISS_FILE = path.join(SERVER_ROOT, "installer", "nugis.iss");

const ISCC_CANDIDATES = [
  "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
  "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
];

function findIscc() {
  for (const candidate of ISCC_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    return execSync("where ISCC.exe", { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    throw new Error(
      "ISCC.exe (Inno Setup 6) non trovato. Installalo da https://jrsoftware.org/isdl.php e riprova."
    );
  }
}

console.log("=== 1/2: build dell'eseguibile (Nugis.exe + risorse) ===");
execSync("node scripts/build-exe.js", { cwd: SERVER_ROOT, stdio: "inherit", env: process.env });

console.log("=== 2/2: compilazione installer con Inno Setup ===");
const iscc = findIscc();
execSync(`"${iscc}" "${ISS_FILE}"`, { cwd: SERVER_ROOT, stdio: "inherit" });

const outDir = path.join(SERVER_ROOT, "installer-output");
console.log(`\n✅ Installer creato in: ${outDir}`);
