export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { supabaseServer } from "@/lib/supabase-server";

type TtsRequest = {
  text: string;
  voice?: string;
  speed?: number;
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n | 0));
}

function exePath() {
  const fromEnv = (process.env.AQUESTALK_TTS_EXE_PATH ?? "").trim();
  if (fromEnv) return path.resolve(fromEnv);

  // Built locally via tools/aquestalk_tts_cmd/build.cmd
  return path.resolve(
    process.cwd(),
    "..",
    "tools",
    "aquestalk_tts_cmd",
    "bin",
    "x64",
    "Release",
    "aquestalk_tts_cmd.exe"
  );
}

async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function parseAllowedEmails() {
  const raw = String(process.env.TOUHOU_TTS_ALLOWED_EMAILS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  let body: TtsRequest;
  try {
    body = (await req.json()) as TtsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  if (text.length > 800) {
    return NextResponse.json({ error: "Text too long" }, { status: 400 });
  }

  const voice = typeof body.voice === "string" && body.voice.trim() ? body.voice.trim() : "f1";
  const speed = clampInt(typeof body.speed === "number" ? body.speed : 100, 50, 300);

  const exe = exePath();
  const configured = (process.env.TOUHOU_TTS_ENABLE ?? "").trim();
  if (configured) {
    if (configured !== "1") {
      return NextResponse.json({ error: "TTS disabled" }, { status: 404 });
    }
  } else {
    // Auto-enable TTS only when running locally on Windows with the helper exe present.
    // This avoids accidental enablement in hosted Linux environments.
    if (process.platform !== "win32" || !(await fileExists(exe))) {
      return NextResponse.json({ error: "TTS disabled" }, { status: 404 });
    }
  }

  // IMPORTANT: Restrict TTS to explicit allowlisted accounts only.
  // This is intended to avoid accidentally enabling voice playback for general users.
  const allowedEmails = parseAllowedEmails();
  if (allowedEmails.length === 0) {
    return NextResponse.json({ error: "TTS disabled" }, { status: 404 });
  }

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    const email = String(data.user?.email ?? "").trim().toLowerCase();
    if (error || !email || !allowedEmails.includes(email)) {
      return NextResponse.json({ error: "TTS disabled" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "TTS disabled" }, { status: 404 });
  }

  if (!(await fileExists(exe))) {
    return NextResponse.json(
      {
        error: "TTS engine not built",
        detail: "Missing aquestalk_tts_cmd.exe. Build it under tools/aquestalk_tts_cmd.",
      },
      { status: 503 }
    );
  }

  const out = path.join(os.tmpdir(), `sigmaris_tts_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`);

  const child = spawn(exe, ["--voice", voice, "--encoding", "utf8", "--speed", String(speed), "--out", out], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (d) => stdout.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
  child.stderr.on("data", (d) => stderr.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));

  child.stdin.write(Buffer.from(text, "utf8"));
  child.stdin.end();

  const exitCode: number = await new Promise((resolve) => {
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });

  if (exitCode !== 0) {
    const detail = Buffer.concat(stderr).toString("utf8").trim() || Buffer.concat(stdout).toString("utf8").trim();
    return NextResponse.json({ error: "TTS failed", detail }, { status: 500 });
  }

  let wav: Buffer;
  try {
    wav = await fs.readFile(out);
  } finally {
    // best-effort cleanup
    fs.unlink(out).catch(() => {});
  }

  const ab = new ArrayBuffer(wav.byteLength);
  new Uint8Array(ab).set(wav);
  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "cache-control": "no-store",
    },
  });
}
