// Builda Nugis come AppImage Linux — un solo file, gira su qualunque distro senza
// installazione, root o systemd (a differenza di scripts/build-installer-linux.js,
// che resta disponibile per chi preferisce un vero servizio di sistema con avvio
// automatico "sempre attivo"). Stesso pattern usato per Datarium_Linux.
//
// Uso: npm run build:appimage:linux -w apps/server
// Produce: installer-output-linux/nugis-<x86_64|aarch64>.AppImage
//
// A differenza degli script installer, questo NON prova a fare cross-arch: va
// eseguito su un host/runner della STESSA arch per cui si vuole l'AppImage (nativo,
// niente pkg "fabricate" cross-arch né QEMU) — più semplice e più affidabile.
// Il workflow CI (.github/workflows/build-linux-installer.yml) usa infatti un runner
// nativo per arch (ubuntu-latest per x64, ubuntu-24.04-arm per arm64).
//
// Richiede `appimagetool` (scaricato automaticamente per l'arch corrente se non
// trovato) e va eseguito su Linux — appimagetool stesso è un binario Linux.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

if (process.platform !== "linux") {
  console.error(
    "Questo script richiede Linux (appimagetool è un binario Linux).\n" +
    "Eseguilo su una macchina/VM Linux, oppure lascia fare al workflow CI:\n" +
    "  .github/workflows/build-linux-installer.yml"
  );
  process.exit(1);
}

const SERVER_ROOT = path.resolve(__dirname, "..");
const INSTALLER_SRC = path.join(SERVER_ROOT, "installer", "linux-appimage");
const OUT_DIR = path.join(SERVER_ROOT, "installer-output-linux");
const APPDIR = path.join(SERVER_ROOT, "AppDir");

const ARCH_MAP = {
  x64: { pkgTarget: "node22-linux-x64", appImageArch: "x86_64" },
  arm64: { pkgTarget: "node22-linux-arm64", appImageArch: "aarch64" },
};
const info = ARCH_MAP[process.arch];
if (!info) {
  console.error(`Architettura host non supportata: ${process.arch}`);
  process.exit(1);
}

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

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "nugis-build" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} scaricando ${url}`));
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

async function ensureAppimagetool() {
  if (process.env.APPIMAGETOOL && fs.existsSync(process.env.APPIMAGETOOL)) return process.env.APPIMAGETOOL;

  const local = path.join(SERVER_ROOT, `appimagetool-${info.appImageArch}.AppImage`);
  if (fs.existsSync(local)) return local;

  const url = `https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${info.appImageArch}.AppImage`;
  console.log(`appimagetool non trovato, lo scarico da ${url}`);
  await download(url, local);
  fs.chmodSync(local, 0o755);
  return local;
}

async function main() {
  console.log(`================ Build exe (${process.arch} -> ${info.pkgTarget}) ================`);
  run("node scripts/build-exe.js", SERVER_ROOT, { PKG_TARGET: info.pkgTarget, OUT_DIR: "dist-exe-appimage", BIN_NAME: "Nugis" });

  console.log("================ Assemblo AppDir ================");
  fs.rmSync(APPDIR, { recursive: true, force: true });
  copyDir(INSTALLER_SRC, APPDIR);
  fs.rmSync(path.join(APPDIR, "nugis-appimage.service.template"), { force: true }); // resta nel repo, non serve dentro l'AppImage
  fs.rmSync(path.join(APPDIR, "install-autostart.sh"), { force: true });
  fs.chmodSync(path.join(APPDIR, "AppRun"), 0o755);

  const binDir = path.join(APPDIR, "usr", "bin");
  fs.mkdirSync(binDir, { recursive: true });
  for (const item of ["Nugis", "generated", "prisma", "public", ".env.example"]) {
    const src = path.join(SERVER_ROOT, "dist-exe-appimage", item);
    const dest = path.join(binDir, item);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
  fs.chmodSync(path.join(binDir, "Nugis"), 0o755);

  console.log("================ appimagetool ================");
  const tool = await ensureAppimagetool();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `nugis-${info.appImageArch}.AppImage`);
  fs.rmSync(outFile, { force: true });
  // --appimage-extract-and-run: appimagetool stesso è distribuito come AppImage e
  // normalmente si automonta via FUSE — non disponibile in molti container/runner CI
  // (stesso problema/stessa soluzione già annotata per Datarium_Linux).
  run(`"${tool}" --appimage-extract-and-run "${APPDIR}" "${outFile}"`, SERVER_ROOT);
  fs.chmodSync(outFile, 0o755);

  console.log(`\n✅ Fatto: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
