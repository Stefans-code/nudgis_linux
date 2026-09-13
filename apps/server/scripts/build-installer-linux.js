// Builda i binari Linux (x64 + arm64) e li pacchettizza in due tarball autoinstallanti:
//   installer-output-linux/nugis-linux-x64.tar.gz
//   installer-output-linux/nugis-linux-arm64.tar.gz
// ciascuno contenente Nugis + generated/ + prisma/ + public/ + .env.example +
// install.sh + uninstall.sh + nugis.service.template (vedi installer/linux/).
//
// Uso: npm run build:installer:linux -w apps/server
//
// Nota onesta: il cross-build (pkg scarica il Node precompilato per il target) funziona
// da qualunque host, ma questo script NON verifica che il binario risultante si avvii
// davvero su una vera distro Linux — quello lo fa il workflow CI
// (.github/workflows/build-linux-installer.yml) su un runner ubuntu-latest reale.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
// Usiamo il "tar" di sistema (presente su Linux/macOS/CI; su Windows serve il tar.exe
// incluso in Windows 10+/Git Bash) invece di una dipendenza npm dedicata.

const SERVER_ROOT = path.resolve(__dirname, "..");
const INSTALLER_SRC = path.join(SERVER_ROOT, "installer", "linux");
const OUT_DIR = path.join(SERVER_ROOT, "installer-output-linux");

const ALL_ARCHES = [
  { arch: "x64", pkgTarget: "node22-linux-x64" },
  { arch: "arm64", pkgTarget: "node22-linux-arm64" },
];
// ONLY_ARCH=x64|arm64: costruisce solo quell'arch. Usato dalla CI (un job per arch, su
// un runner nativo di QUELL'arch — vedi .github/workflows/build-linux-installer.yml)
// per evitare il problema di fabbricazione cross-arch di pkg (vedi più sotto).
const ARCHES = process.env.ONLY_ARCH ? ALL_ARCHES.filter((a) => a.arch === process.env.ONLY_ARCH) : ALL_ARCHES;

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

const hostArch = process.arch === "arm64" ? "arm64" : "x64"; // "x64"/"ia32"/... -> trattiamo tutto il resto come x64

for (const { arch, pkgTarget } of ARCHES) {
  console.log(`\n================ Linux ${arch} (${pkgTarget}) ================`);
  const buildDirName = `dist-exe-linux-${arch}`;
  const bundleName = `nugis-linux-${arch}`;
  const bundleDir = path.join(OUT_DIR, bundleName);

  try {
    run("node scripts/build-exe.js", SERVER_ROOT, {
      PKG_TARGET: pkgTarget,
      OUT_DIR: buildDirName,
    });
  } catch (err) {
    if (arch !== hostArch) {
      // pkg per un'architettura CPU diversa da quella host deve "fabbricare" il binario
      // eseguendo il binario di destinazione stesso durante il processo di build — cosa
      // che fallisce senza emulazione (QEMU/Rosetta) quando le due arch non coincidono,
      // anche cambiando solo il sistema operativo target funziona (verificato: da questo
      // host è andata bene Linux STESSA arch, qui sotto invece l'arch è diversa).
      // Non tentiamo emulazione qui: saltiamo e lasciamo che la CI (runner nativo per
      // quell'arch, vedi .github/workflows/build-linux-installer.yml) produca questa
      // variante. Continuiamo con le altre arch invece di far fallire tutto lo script.
      console.warn(
        `\n⚠️  Salto Linux ${arch}: build cross-arch non disponibile su questo host (${process.arch}). ` +
        `Serve un host/runner ${arch} reale (o QEMU) — vedi il workflow CI. Errore originale: ${err.message}`
      );
      continue;
    }
    throw err;
  }

  console.log(`Assemblo il pacchetto in ${bundleDir}`);
  fs.rmSync(bundleDir, { recursive: true, force: true });
  copyDir(path.join(SERVER_ROOT, buildDirName), bundleDir);
  copyDir(INSTALLER_SRC, bundleDir); // install.sh, uninstall.sh, nugis.service.template
  fs.chmodSync(path.join(bundleDir, "install.sh"), 0o755);
  fs.chmodSync(path.join(bundleDir, "uninstall.sh"), 0o755);
  try {
    fs.chmodSync(path.join(bundleDir, "Nugis"), 0o755);
  } catch {
    /* build-exe.js già ci prova; ignorato se non ha effetto su questo filesystem */
  }

  const tarPath = path.join(OUT_DIR, `${bundleName}.tar.gz`);
  console.log(`Comprimo in ${tarPath}`);
  // --force-local: senza questo flag, bsdtar (quello incluso in Git Bash/Windows)
  // interpreta un path assoluto con ":" (es. "C:\...") come un host remoto in stile
  // ssh ("C" host, resta a provare una connessione di rete) invece che come un
  // percorso locale. Su Linux/macOS/CI il flag è un no-op innocuo.
  run(`tar --force-local -czf "${tarPath}" -C "${OUT_DIR}" "${bundleName}"`, OUT_DIR);
}

console.log(`\n✅ Fatto. Tarball in: ${OUT_DIR}`);
