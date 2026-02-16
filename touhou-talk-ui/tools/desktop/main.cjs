const { app, BrowserWindow } = require("electron");
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const isDev = !app.isPackaged;

function readEnvFile(p) {
  try {
    const txt = fs.readFileSync(p, "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const i = s.indexOf("=");
      if (i <= 0) continue;
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim();
      if (!k) continue;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function ensureEnvTemplate(envPath) {
  if (fs.existsSync(envPath)) return;
  const tpl = [
    "# Touhou Talk Desktop env (local only)",
    "",
    "# Supabase",
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "",
    "# Backend Persona OS URL (FastAPI / sigmaris_core)",
    "SIGMARIS_CORE_URL=http://127.0.0.1:8000",
    "",
    "# TTS (AquesTalk) — enable only for your account",
    "TOUHOU_TTS_ENABLE=1",
    "TOUHOU_TTS_ALLOWED_EMAILS=kaiseif4e@gmail.com",
    "",
    "# Optional: force port",
    "TOUHOU_DESKTOP_PORT=3789",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, tpl, "utf8");
}

function resolveEnvPath() {
  const filename = "touhou-talk.env";

  const candidates = [
    // Standard Electron location (depends on app name / productName)
    path.join(app.getPath("userData"), filename),

    // Common alternatives (older builds / different naming)
    path.join(app.getPath("appData"), "touhou-talk", filename),
    path.join(app.getPath("appData"), "Touhou Talk", filename),
  ];

  // Prefer a file that already contains required keys.
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const vars = readEnvFile(p);
      const url = String(vars?.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
      const anon = String(vars?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
      if (url && anon) return p;
    } catch {}
  }

  // Otherwise prefer any existing file.
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }

  // Otherwise default to userData (we'll create a template there).
  return candidates[0];
}

function applyEnvFromDisk() {
  const envPath = resolveEnvPath();
  ensureEnvTemplate(envPath);

  process.env.TOUHOU_DESKTOP_ENV_PATH = envPath;
  process.env.TOUHOU_DESKTOP_USERDATA_DIR = app.getPath("userData");

  const vars = readEnvFile(envPath);
  if (!vars) return;
  for (const [k, v] of Object.entries(vars)) {
    if (typeof process.env[k] === "string" && process.env[k] !== "") continue;
    process.env[k] = String(v);
  }
}

function desktopPort() {
  const raw = String(process.env.TOUHOU_DESKTOP_PORT ?? "").trim();
  const n = Number(raw || "3789");
  if (!Number.isFinite(n) || n <= 0) return 3789;
  return Math.min(65535, Math.max(1024, Math.floor(n)));
}

function bundleRoot() {
  if (isDev) {
    // repo-relative: touhou-talk-ui/tools/desktop -> touhou-talk-ui/tools/desktop/.bundle
    return path.resolve(__dirname, ".bundle");
  }
  // packaged: resources/bundle
  return path.join(process.resourcesPath, "bundle");
}

function nextServerCwd() {
  return path.join(bundleRoot(), "next");
}

function nextServerEntry() {
  return path.join(nextServerCwd(), "server.js");
}

function guessAquesExePath() {
  const fromEnv = String(process.env.AQUESTALK_TTS_EXE_PATH ?? "").trim();
  if (fromEnv) return fromEnv;

  const bundled = path.join(bundleRoot(), "aquestalk_tts_cmd.exe");
  if (fs.existsSync(bundled)) return bundled;

  // dev fallback: repo tools path (if present)
  const repoExe = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "tools",
    "aquestalk_tts_cmd",
    "bin",
    "x64",
    "Release",
    "aquestalk_tts_cmd.exe"
  );
  if (fs.existsSync(repoExe)) return repoExe;

  return "";
}

let serverProc = null;

async function startNextServer() {
  const entry = nextServerEntry();
  const cwd = nextServerCwd();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Next standalone server not found: ${entry}\nRun: npm run desktop:prepare`
    );
  }

  const port = desktopPort();

  process.env.NODE_ENV = "production";
  process.env.PORT = String(port);
  process.env.AQUESTALK_TTS_EXE_PATH = guessAquesExePath();

  serverProc = fork(entry, [], {
    cwd,
    env: { ...process.env },
    stdio: "pipe",
  });

  serverProc.on("exit", () => {
    serverProc = null;
  });

  // Wait for server to start (best-effort)
  const url = `http://127.0.0.1:${port}`;
  const started = await waitForHttp(url, 20000);
  if (!started) {
    throw new Error("Next server failed to start within timeout");
  }
  return url;
}

function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const http = require("node:http");
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
      req.setTimeout(1500, () => {
        req.destroy();
      });
    };
    tick();
  });
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0b0b12",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(url);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    serverProc?.kill();
  } catch {}
});

app.whenReady().then(async () => {
  applyEnvFromDisk();

  if (isDev) {
    // In dev we just open the normal Next dev server.
    const url = process.env.TOUHOU_DESKTOP_DEV_URL || "http://127.0.0.1:3000";
    createWindow(url);
    return;
  }

  const url = await startNextServer();
  createWindow(url);
});
