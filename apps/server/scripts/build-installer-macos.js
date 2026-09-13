// Builda i binari macOS (x64 + arm64) e li impacchetta in UN SOLO installer universale
// (stesso file per Intel e Apple Silicon, sceglie da solo il binario giusto
// all'installazione — vedi installer/macos/install.sh e postinstall):
//   nugis-macos-universal.tar.gz   <- estrai ed esegui "sudo ./install.sh" (interattivo)
//   NugisInstaller.pkg             <- doppio clic, password admin iniziale casuale
//
// Uso: npm run build:installer:macos -w apps/server
//
// PERCHÉ NON un vero binario universale con `lipo`: provato e scartato (13/09/2026) —
// `pkg` aggiunge dopo il Mach-O un payload custom (bootstrap + snapshot V8) con offset
// che si riferiscono alla POSIZIONE ORIGINALE nel file. `lipo -create` sposta le due
// fette dentro un fat-file più grande senza riscrivere quegli offset: il risultato
// compila (lipo non si accorge di nulla) ma CRASHA all'avvio con un
// "SyntaxError: Invalid or unexpected token" su byte del payload letti al posto
// sbagliato — scoperto perché la CI lo installa ed esegue per davvero, non solo lo
// builda. Un solo pacchetto con ENTRAMBI i binari + selezione automatica all'avvio
// (uname -m) ottiene lo stesso risultato per l'utente finale (un download, funziona
// su qualunque Mac) in modo affidabile.
//
// IMPORTANTE: `pkgbuild`/`codesign` esistono SOLO su macOS. Questo script va eseguito
// su un Mac (o nel workflow CI .github/workflows/build-macos-installer.yml, runner
// macos-latest) — su Windows/Linux fallisce subito con un errore chiaro.
//
// Firma/notarizzazione: NON fatta qui (serve un Apple Developer ID, a pagamento) — il
// pacchetto risultante non è firmato. Gatekeeper mostrerà un avviso "sviluppatore non
// verificato" al primo avvio, esattamente come SmartScreen su Windows per l'installer
// non firmato (vedi docs/installer.md). Stesso compromesso, non ancora risolto qui.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "darwin") {
  console.error(
    "Questo script richiede macOS (usa pkgbuild, non disponibile altrove).\n" +
    "Eseguilo su un Mac, oppure lascia che lo faccia il workflow CI:\n" +
    "  .github/workflows/build-macos-installer.yml (runner macos-latest)."
  );
  process.exit(1);
}

const SERVER_ROOT = path.resolve(__dirname, "..");
const INSTALLER_SRC = path.join(SERVER_ROOT, "installer", "macos");
const OUT_DIR = path.join(SERVER_ROOT, "installer-output-macos");
const BUNDLE_NAME = "nugis-macos-universal";
const BUNDLE_DIR = path.join(OUT_DIR, BUNDLE_NAME);

function run(cmd, cwd, env) {
  console.log(`\n$ ${cmd}`);
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

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("================ macOS x64 ================");
run("node scripts/build-exe.js", SERVER_ROOT, { PKG_TARGET: "node22-macos-x64", OUT_DIR: "dist-exe-macos-x64", BIN_NAME: "Nugis-x64" });

console.log("================ macOS arm64 ================");
run("node scripts/build-exe.js", SERVER_ROOT, { PKG_TARGET: "node22-macos-arm64", OUT_DIR: "dist-exe-macos-arm64", BIN_NAME: "Nugis-arm64" });

console.log("================ Assemblo il pacchetto unico (entrambi i binari) ================");
fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });
fs.copyFileSync(path.join(SERVER_ROOT, "dist-exe-macos-x64", "Nugis-x64"), path.join(BUNDLE_DIR, "Nugis-x64"));
fs.copyFileSync(path.join(SERVER_ROOT, "dist-exe-macos-arm64", "Nugis-arm64"), path.join(BUNDLE_DIR, "Nugis-arm64"));
fs.chmodSync(path.join(BUNDLE_DIR, "Nugis-x64"), 0o755);
fs.chmodSync(path.join(BUNDLE_DIR, "Nugis-arm64"), 0o755);

// prisma/public sono identici tra le due arch (build statica/migrazioni, indipendenti
// dall'arch) — ne basta una copia sola, presa dalla build x64.
for (const d of ["prisma", "public"]) {
  copyDir(path.join(SERVER_ROOT, "dist-exe-macos-x64", d), path.join(BUNDLE_DIR, d));
}
// generated/prisma-client invece va unito da ENTRAMBE le build: build-exe.js filtra i
// motori nativi per-target, quindi x64 porta solo darwin-x64 e arm64 solo darwin-arm64.
// install.sh/postinstall lanciano il binario giusto per l'hardware corrente, che a sua
// volta ha bisogno del SUO motore — servono entrambi nello stesso pacchetto.
copyDir(path.join(SERVER_ROOT, "dist-exe-macos-x64", "generated"), path.join(BUNDLE_DIR, "generated"));
copyDir(path.join(SERVER_ROOT, "dist-exe-macos-arm64", "generated"), path.join(BUNDLE_DIR, "generated"));
fs.copyFileSync(path.join(SERVER_ROOT, "dist-exe-macos-x64", ".env.example"), path.join(BUNDLE_DIR, ".env.example"));
copyDir(INSTALLER_SRC, BUNDLE_DIR);
for (const f of ["install.sh", "uninstall.sh"]) fs.chmodSync(path.join(BUNDLE_DIR, f), 0o755);

console.log("================ tarball (via install.sh, interattivo) ================");
const tarPath = path.join(OUT_DIR, `${BUNDLE_NAME}.tar.gz`);
run(`tar -czf "${tarPath}" -C "${OUT_DIR}" "${BUNDLE_NAME}"`); // eseguito solo su macOS: niente quirk bsdtar/Windows qui

console.log("================ .pkg (GUI, doppio clic — vedi postinstall) ================");
const pkgRoot = path.join(OUT_DIR, "pkgroot", "usr", "local", "nugis");
fs.rmSync(path.join(OUT_DIR, "pkgroot"), { recursive: true, force: true });
fs.mkdirSync(pkgRoot, { recursive: true });
for (const d of ["generated", "prisma", "public"]) copyDir(path.join(BUNDLE_DIR, d), path.join(pkgRoot, d));
for (const f of ["Nugis-x64", "Nugis-arm64"]) {
  fs.copyFileSync(path.join(BUNDLE_DIR, f), path.join(pkgRoot, f));
  fs.chmodSync(path.join(pkgRoot, f), 0o755);
}
fs.copyFileSync(path.join(BUNDLE_DIR, ".env.example"), path.join(pkgRoot, ".env.example"));
fs.copyFileSync(path.join(INSTALLER_SRC, "nugis.plist.template"), path.join(pkgRoot, "nugis.plist.template"));
fs.copyFileSync(path.join(INSTALLER_SRC, "uninstall.sh"), path.join(pkgRoot, "uninstall.sh"));
fs.chmodSync(path.join(pkgRoot, "uninstall.sh"), 0o755);

const scriptsDir = path.join(OUT_DIR, "pkgscripts");
fs.rmSync(scriptsDir, { recursive: true, force: true });
fs.mkdirSync(scriptsDir, { recursive: true });
fs.copyFileSync(path.join(INSTALLER_SRC, "postinstall"), path.join(scriptsDir, "postinstall"));
fs.chmodSync(path.join(scriptsDir, "postinstall"), 0o755);

const pkgOut = path.join(OUT_DIR, "NugisInstaller.pkg");
run(
  `pkgbuild --root "${path.join(OUT_DIR, "pkgroot")}" --scripts "${scriptsDir}" --identifier com.nugis.app --version 1.0.0 --install-location / "${pkgOut}"`
);

console.log(`\n✅ Fatto. Output in: ${OUT_DIR}`);
console.log("   Un solo pacchetto per Intel e Apple Silicon (sceglie il binario giusto da solo).");
console.log("   NON firmato/notarizzato: Gatekeeper avviserà 'sviluppatore non verificato' al primo avvio.");
