// Builda i binari Linux (x64 + arm64) e li impacchetta in UN SOLO tarball universale
// (stesso file per qualunque distro x64/arm64, sceglie da solo il binario giusto
// all'installazione in base a "uname -m" — vedi installer/linux/install.sh):
//   installer-output-linux/nugis-linux-universal.tar.gz
//
// Uso: npm run build:installer:linux -w apps/server
//
// Cross-arch: pkg deve "fabbricare" il binario della arch target eseguendolo — su un
// host x64 puro questo fallisce per "node22-linux-arm64" (nessuna emulazione). In CI
// (.github/workflows/build-linux-installer.yml) registriamo QEMU via
// docker/setup-qemu-action PRIMA di lanciare questo script, cosa che rende possibile
// fabbricare anche il target arm64 sullo stesso runner ubuntu-latest x64 (stesso
// principio di Rosetta per macOS). In locale, senza QEMU, l'arch diversa da quella
// host viene saltata con un avviso invece di far fallire tutto lo script.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SERVER_ROOT = path.resolve(__dirname, "..");
const INSTALLER_SRC = path.join(SERVER_ROOT, "installer", "linux");
const OUT_DIR = path.join(SERVER_ROOT, "installer-output-linux");
const BUNDLE_NAME = "nugis-linux-universal";
const BUNDLE_DIR = path.join(OUT_DIR, BUNDLE_NAME);

const ALL_ARCHES = [
  { arch: "x64", pkgTarget: "node22-linux-x64", binName: "Nugis-x64" },
  { arch: "arm64", pkgTarget: "node22-linux-arm64", binName: "Nugis-arm64" },
];
// ONLY_ARCH=x64|arm64: costruisce solo quell'arch (utile per test rapidi in locale).
const ARCHES = process.env.ONLY_ARCH ? ALL_ARCHES.filter((a) => a.arch === process.env.ONLY_ARCH) : ALL_ARCHES;
const hostArch = process.arch === "arm64" ? "arm64" : "x64";

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
fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

const built = [];
for (const { arch, pkgTarget, binName } of ARCHES) {
  console.log(`\n================ Linux ${arch} (${pkgTarget}) ================`);
  const buildDirName = `dist-exe-linux-${arch}`;
  try {
    run("node scripts/build-exe.js", SERVER_ROOT, { PKG_TARGET: pkgTarget, OUT_DIR: buildDirName, BIN_NAME: binName });
  } catch (err) {
    if (arch !== hostArch) {
      console.warn(
        `\n⚠️  Salto Linux ${arch}: build cross-arch non disponibile su questo host (${process.arch}) senza QEMU. ` +
        `In CI viene registrato QEMU (docker/setup-qemu-action) prima di questo script, quindi lì funziona. ` +
        `Errore originale: ${err.message}`
      );
      continue;
    }
    throw err;
  }
  built.push({ arch, binName, buildDirName });
}

if (built.length === 0) {
  console.error("Nessuna arch buildata con successo — niente da impacchettare.");
  process.exit(1);
}

console.log("\n================ Assemblo il pacchetto unico ================");
for (const { binName, buildDirName } of built) {
  fs.copyFileSync(path.join(SERVER_ROOT, buildDirName, binName), path.join(BUNDLE_DIR, binName));
  fs.chmodSync(path.join(BUNDLE_DIR, binName), 0o755);
}
// prisma/public sono identici tra le arch — una copia sola, dalla prima build riuscita.
for (const d of ["prisma", "public"]) {
  copyDir(path.join(SERVER_ROOT, built[0].buildDirName, d), path.join(BUNDLE_DIR, d));
}
// generated/prisma-client va invece UNITO da tutte le build riuscite: ciascuna porta
// solo il motore Prisma della propria arch (filtro in build-exe.js) e install.sh lancia
// il binario giusto per l'hardware corrente, che ha bisogno del SUO motore.
for (const { buildDirName } of built) {
  copyDir(path.join(SERVER_ROOT, buildDirName, "generated"), path.join(BUNDLE_DIR, "generated"));
}
fs.copyFileSync(path.join(SERVER_ROOT, built[0].buildDirName, ".env.example"), path.join(BUNDLE_DIR, ".env.example"));
copyDir(INSTALLER_SRC, BUNDLE_DIR); // install.sh, uninstall.sh, nugis.service.template
fs.chmodSync(path.join(BUNDLE_DIR, "install.sh"), 0o755);
fs.chmodSync(path.join(BUNDLE_DIR, "uninstall.sh"), 0o755);

const tarPath = path.join(OUT_DIR, `${BUNDLE_NAME}.tar.gz`);
console.log(`Comprimo in ${tarPath}`);
// --force-local: senza questo flag, bsdtar (quello incluso in Git Bash/Windows)
// interpreta un path assoluto con ":" (es. "C:\...") come un host remoto in stile ssh
// invece che come un percorso locale. Su Linux/macOS/CI il flag è un no-op innocuo.
run(`tar --force-local -czf "${tarPath}" -C "${OUT_DIR}" "${BUNDLE_NAME}"`, OUT_DIR);

console.log(`\n✅ Fatto. Pacchetto (${built.map((b) => b.arch).join("+")}) in: ${tarPath}`);
if (built.length < ALL_ARCHES.length) {
  console.warn(`⚠️  Solo ${built.map((b) => b.arch).join(", ")} incluse — vedi avvisi sopra per le arch saltate.`);
}
