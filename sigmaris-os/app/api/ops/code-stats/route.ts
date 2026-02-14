export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import fs from "node:fs";
import path from "node:path";

type FileKind = "code" | "docs";

type CountOptions = {
  includeDocs: boolean;
  includeEngine: boolean;
  includeSupabaseSql: boolean;
};

type Bucket = {
  files: number;
  lines: number;
  byExt: Record<string, { files: number; lines: number }>;
};

type ProjectStats = {
  name: string;
  root: string;
  note?: string;
  total: Bucket;
  code: Bucket;
  docs: Bucket;
};

function envOn(name: string) {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

function isSubpath(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function bucketInit(): Bucket {
  return { files: 0, lines: 0, byExt: {} };
}

function addToBucket(b: Bucket, ext: string, lines: number) {
  b.files += 1;
  b.lines += lines;
  b.byExt[ext] ??= { files: 0, lines: 0 };
  b.byExt[ext].files += 1;
  b.byExt[ext].lines += lines;
}

function countLines(buf: Buffer): number {
  const n = buf.length;
  if (n === 0) return 0;
  let newlines = 0;
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0x0a) newlines++;
  }
  return newlines + (buf[n - 1] === 0x0a ? 0 : 1);
}

function fileKindForExt(ext: string): FileKind | null {
  const e = ext.toLowerCase();
  if (
    e === ".py" ||
    e === ".ts" ||
    e === ".tsx" ||
    e === ".js" ||
    e === ".jsx" ||
    e === ".mjs" ||
    e === ".cjs" ||
    e === ".css" ||
    e === ".scss" ||
    e === ".sql"
  )
    return "code";
  if (e === ".md" || e === ".mdx") return "docs";
  return null;
}

function shouldSkipDir(name: string, opts: { includeEngine: boolean }) {
  const { includeEngine } = opts;
  const n = name.toLowerCase();
  if (
    n === "node_modules" ||
    n === ".next" ||
    n === "dist" ||
    n === "build" ||
    n === "out" ||
    n === ".turbo" ||
    n === ".vercel" ||
    n === "coverage" ||
    n === "__pycache__" ||
    n === ".pytest_cache" ||
    n === ".mypy_cache"
  )
    return true;

  // Sigmaris-OS specific: "Next.js core engine" is interpreted as the local `engine/` package.
  if (!includeEngine && n === "engine") return true;

  // Large non-source folders
  if (n === "public" || n === "data" || n === "temp" || n === "progress")
    return true;

  return false;
}

async function walkFiles(
  rootDir: string,
  opts: { includeEngine: boolean; maxFiles: number }
): Promise<string[]> {
  const { includeEngine, maxFiles } = opts;
  const out: string[] = [];

  async function rec(dir: string) {
    if (out.length >= maxFiles) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDir(ent.name, { includeEngine })) continue;
        await rec(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }

  await rec(rootDir);
  return out;
}

async function computeProjectStats(
  name: string,
  projectRoot: string,
  params: { options: CountOptions; note?: string }
): Promise<ProjectStats> {
  const options = params.options;
  const resolvedNote = params.note;
  const code = bucketInit();
  const docs = bucketInit();
  const total = bucketInit();

  const files = await walkFiles(projectRoot, {
    includeEngine: options.includeEngine,
    maxFiles: 60_000,
  });

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const kind = fileKindForExt(ext);
    if (kind === "docs" && !options.includeDocs) continue;
    if (kind === "code" && ext === ".sql" && !options.includeSupabaseSql)
      continue;
    if (kind == null) continue;

    let buf: Buffer;
    try {
      buf = await fs.promises.readFile(f);
    } catch {
      continue;
    }
    const lines = countLines(buf);
    addToBucket(total, ext, lines);
    if (kind === "code") addToBucket(code, ext, lines);
    if (kind === "docs") addToBucket(docs, ext, lines);
  }

  return { name, root: projectRoot, note: resolvedNote, total, code, docs };
}

let _cache:
  | { key: string; at: number; payload: any }
  | null = null;

export async function GET(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const enabled = envOn("SIGMARIS_CODE_STATS_ENABLED");
    const allowInDev = process.env.NODE_ENV !== "production";
    if (!enabled && !allowInDev) {
      return NextResponse.json(
        { error: "Disabled. Set SIGMARIS_CODE_STATS_ENABLED=1" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const includeDocs = url.searchParams.get("include_docs") === "1";
    const includeEngine =
      url.searchParams.get("include_engine") === "1";
    const includeSupabaseSql =
      url.searchParams.get("include_sql") !== "0";
    const options: CountOptions = {
      includeDocs,
      includeEngine,
      includeSupabaseSql,
    };

    const cwd = process.cwd();
    const repoCandidate = path.resolve(cwd, "..");
    const hasMonorepoSiblings =
      fs.existsSync(path.join(repoCandidate, "sigmaris_core")) &&
      fs.existsSync(path.join(repoCandidate, "touhou-talk-ui"));
    const repoRoot = hasMonorepoSiblings ? repoCandidate : cwd;

    const sigmarisCoreRoot = path.join(repoRoot, "sigmaris_core");
    const sigmarisOsRoot = path.join(repoRoot, "sigmaris-os");
    const touhouRoot = path.join(repoRoot, "touhou-talk-ui");
    const supabaseRoot = path.join(repoRoot, "supabase");

    const safetyRoots = [sigmarisCoreRoot, sigmarisOsRoot, touhouRoot, supabaseRoot];
    for (const r of safetyRoots) {
      if (!isSubpath(repoRoot, r)) {
        return NextResponse.json({ error: "invalid root resolution" }, { status: 500 });
      }
    }

    const cacheTtlMs = clampInt(
      Number(process.env.SIGMARIS_CODE_STATS_CACHE_TTL_MS ?? "15000"),
      1000,
      300000
    );
    const cacheKey = JSON.stringify({ repoRoot, options });
    if (_cache && _cache.key === cacheKey && Date.now() - _cache.at < cacheTtlMs) {
      return NextResponse.json(_cache.payload, { status: 200 });
    }

    const projects: ProjectStats[] = [];

    if (fs.existsSync(sigmarisCoreRoot)) {
      projects.push(
        await computeProjectStats("sigmaris-core", sigmarisCoreRoot, {
          options: { ...options, includeSupabaseSql: false },
          note: "Python backend (sigmaris_core).",
        })
      );
    } else {
      projects.push({
        name: "sigmaris-core",
        root: sigmarisCoreRoot,
        note: "Not found in this deployment workspace.",
        total: bucketInit(),
        code: bucketInit(),
        docs: bucketInit(),
      });
    }

    if (fs.existsSync(sigmarisOsRoot)) {
      projects.push(
        await computeProjectStats("sigmaris-os", sigmarisOsRoot, {
          options,
          note: "Next.js UI (excluding node_modules/.next, optional engine/).",
        })
      );
    } else {
      projects.push({
        name: "sigmaris-os",
        root: sigmarisOsRoot,
        note: "Not found in this deployment workspace.",
        total: bucketInit(),
        code: bucketInit(),
        docs: bucketInit(),
      });
    }

    if (fs.existsSync(touhouRoot)) {
      projects.push(
        await computeProjectStats("touhou-talk-ui", touhouRoot, {
          options,
          note: "Next.js UI (excluding node_modules/.next).",
        })
      );
    } else {
      projects.push({
        name: "touhou-talk-ui",
        root: touhouRoot,
        note: "Not found in this deployment workspace.",
        total: bucketInit(),
        code: bucketInit(),
        docs: bucketInit(),
      });
    }

    if (options.includeSupabaseSql && fs.existsSync(supabaseRoot)) {
      projects.push(
        await computeProjectStats("supabase-sql", supabaseRoot, {
          options: { ...options, includeDocs: false, includeEngine: true, includeSupabaseSql: true },
          note: "SQL migrations/setup scripts.",
        })
      );
    }

    const payload = {
      ok: true,
      generated_at: new Date().toISOString(),
      repo_root: repoRoot,
      options,
      excludes: {
        dirs: [
          "node_modules",
          ".next",
          "dist",
          "build",
          "out",
          ".turbo",
          ".vercel",
          "coverage",
          "__pycache__",
          ".pytest_cache",
          ".mypy_cache",
          "public",
          "data",
          "temp",
          "progress",
          ...(options.includeEngine ? [] : ["engine"]),
        ],
        note: "Excludes are applied by folder name during recursion.",
      },
      projects,
    };

    _cache = { key: cacheKey, at: Date.now(), payload };
    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[/api/ops/code-stats] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
