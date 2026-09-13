// Builda i binari macOS (x64 + arm64), li unisce in un unico binario universale con
// `lipo` e produce due deliverable in installer-output-macos/:
//   nugis-macos-universal.tar.gz   <- estrai ed esegui "sudo ./install.sh" (interattivo)
//   NugisInstaller.pkg             <- doppio clic, password admin iniziale casuale
//                                     (vedi installer/macos/postinstall e docs/installer-macos.md)
//
// Uso: npm run build:installer:macos -w apps/server
//
// IMPORTANTE: `lipo`, `pkgbuild` e `codesign` esistono SOLO su macOS. Questo script
// va eseguito su un Mac (o nel workflow CI .github/workflows/build-macos-installer.yml,
// runner macos-latest) — su Windows/Linux fallisce subito con un errore chiaro invece
// di produrre un output silenziosamente incompleto o sbagliato.
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
    "Questo script richiede macOS (usa lipo/pkgbuild, non disponibili altrove).\n" +
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

console.log("================ lipo: binario universale x64+arm64 ================");
fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });
run(
  `lipo -create "${path.join(SERVER_ROOT, "dist-exe-macos-x64", "Nugis-x64")}" "${path.join(SERVER_ROOT, "dist-exe-macos-arm64", "Nugis-arm64")}" -output "${path.join(BUNDLE_DIR, "Nugis")}"`
);
fs.chmodSync(path.join(BUNDLE_DIR, "Nugis"), 0o755);
run(`lipo -info "${path.join(BUNDLE_DIR, "Nugis")}"`); // stampa gli archs presenti, verifica a vista

// generated/prisma/public sono identici tra le due arch (il client Prisma include già
// TUTTI i motori nativi, vedi schema.prisma binaryTargets; il pannello web è build
// statica indipendente dall'arch) — ne basta una copia sola, presa dalla build x64.
for (const d of ["generated", "prisma", "public"]) {
  copyDir(path.join(SERVER_ROOT, "dist-exe-macos-x64", d), path.join(BUNDLE_DIR, d));
}
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
fs.copyFileSync(path.join(BUNDLE_DIR, "Nugis"), path.join(pkgRoot, "Nugis"));
fs.chmodSync(path.join(pkgRoot, "Nugis"), 0o755);
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
console.log("   NON firmato/notarizzato: Gatekeeper avviserà 'sviluppatore non verificato' al primo avvio.");
