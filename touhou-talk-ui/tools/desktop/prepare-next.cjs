const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

async function rmrf(p) {
  await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
}

async function copyDir(src, dst) {
  await fsp.mkdir(dst, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (e) => {
      const s = path.join(src, e.name);
      const d = path.join(dst, e.name);
      if (e.isDirectory()) return copyDir(s, d);
      if (e.isSymbolicLink()) return;
      await fsp.copyFile(s, d);
    })
  );
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const bundleRoot = path.resolve(__dirname, ".bundle");
  const outNext = path.join(bundleRoot, "next");

  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const staticDir = path.join(projectRoot, ".next", "static");
  const publicDir = path.join(projectRoot, "public");

  if (!fs.existsSync(standaloneDir)) {
    throw new Error("Missing .next/standalone. Run `next build` first.");
  }

  await rmrf(bundleRoot);
  await fsp.mkdir(bundleRoot, { recursive: true });

  // Copy standalone server (contains server.js and required node_modules)
  await copyDir(standaloneDir, outNext);

  // Next standalone expects `.next/static` alongside server.js
  await copyDir(staticDir, path.join(outNext, ".next", "static"));

  // And `public/` alongside server.js
  await copyDir(publicDir, path.join(outNext, "public"));

  // Optional: include AquesTalk helper exe if present locally (not tracked by git)
  const exeSrc = path.resolve(
    projectRoot,
    "..",
    "tools",
    "aquestalk_tts_cmd",
    "bin",
    "x64",
    "Release",
    "aquestalk_tts_cmd.exe"
  );
  const exeDst = path.join(bundleRoot, "aquestalk_tts_cmd.exe");
  if (fs.existsSync(exeSrc)) {
    await fsp.copyFile(exeSrc, exeDst);
  }

  console.log(`[desktop] bundle ready: ${bundleRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

