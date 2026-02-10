import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import iconv from "iconv-lite";

/**
 * =========================
 * Config (TS / TSX 専用)
 * =========================
 */

const OUT_BASENAME = "ALL_CODE";
const OUT_EXT = ".txt";
const MAX_LINES_PER_FILE = 10_000;

// 除外ディレクトリ（Node / VSCode 前提）
const EXCLUDE_DIRS = new Set([
  ".git",
  ".github",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".cache",
]);

// 明示的に除外する拡張子（バイナリ系）
const EXCLUDE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".pdf",
  ".exe",
  ".dll",
  ".so",
]);

// **TS / TSX プロジェクト用に固定**
const INCLUDE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".env",
]);

// 拡張子に依らず必ず含めるファイル
const ALLOW_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "tsconfig.base.json",
  "README.md",
  ".env",
]);

/**
 * =========================
 * Utils
 * =========================
 */

function isExcludedDir(dirPath: string): boolean {
  return dirPath.split(path.sep).some((p) => EXCLUDE_DIRS.has(p));
}

function shouldIncludeFile(filePath: string): boolean {
  const stat = fsSync.statSync(filePath);
  if (!stat.isFile()) return false;

  if (isExcludedDir(path.dirname(filePath))) return false;

  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);

  if (EXCLUDE_EXTS.has(ext)) return false;
  if (ALLOW_FILENAMES.has(name)) return true;

  return INCLUDE_EXTS.has(ext);
}

async function safeReadText(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);

  // Windows / 日本語環境も想定
  for (const enc of ["utf8", "cp932"]) {
    try {
      return iconv.decode(buf, enc);
    } catch {
      continue;
    }
  }

  return buf.toString("utf8");
}

/**
 * =========================
 * SplitWriter
 * =========================
 */

class SplitWriter {
  private root: string;
  private partIndex = 1;
  private currentLines = 0;
  private stream: fsSync.WriteStream | null = null;

  constructor(root: string) {
    this.root = root;
    this.openNewFile();
  }

  private openNewFile() {
    if (this.stream) this.stream.end();

    const suffix = `_part${String(this.partIndex).padStart(3, "0")}`;
    const outPath = path.join(this.root, `${OUT_BASENAME}${suffix}${OUT_EXT}`);

    this.stream = fsSync.createWriteStream(outPath, { encoding: "utf8" });
    this.currentLines = 0;
    this.partIndex++;
  }

  write(text: string) {
    for (const line of text.split(/(?<=\n)/)) {
      if (this.currentLines >= MAX_LINES_PER_FILE) {
        this.openNewFile();
      }
      this.stream!.write(line);
      this.currentLines++;
    }
  }

  close() {
    this.stream?.end();
  }
}

/**
 * =========================
 * Walk directory
 * =========================
 */

async function collectFiles(root: string): Promise<string[]> {
  const result: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const e of entries) {
      const full = path.join(dir, e.name);

      if (e.isDirectory()) {
        if (!EXCLUDE_DIRS.has(e.name)) {
          await walk(full);
        }
      } else {
        if (shouldIncludeFile(full)) {
          result.push(full);
        }
      }
    }
  }

  await walk(root);
  return result;
}

/**
 * =========================
 * Main
 * =========================
 */

async function main() {
  const targetDir = process.argv[2];

  if (!targetDir) {
    console.error("Usage: ts-node dump_all_code.ts <target_directory>");
    process.exit(1);
  }

  const root = path.resolve(targetDir);
  const stat = await fs.stat(root).catch(() => null);

  if (!stat || !stat.isDirectory()) {
    console.error(`Invalid directory: ${root}`);
    process.exit(1);
  }

  const files = await collectFiles(root);
  files.sort((a, b) =>
    path.relative(root, a).localeCompare(path.relative(root, b))
  );

  const writer = new SplitWriter(root);

  try {
    writer.write(`# Project root: ${root}\n`);
    writer.write(`# Total files: ${files.length}\n\n`);

    for (const f of files) {
      const rel = path.relative(root, f);

      writer.write(
        "\n" +
          "=".repeat(100) +
          "\n" +
          `FILE: ${rel}\n` +
          "=".repeat(100) +
          "\n\n"
      );

      const content = await safeReadText(f);
      writer.write(content);
      if (!content.endsWith("\n")) writer.write("\n");
    }
  } finally {
    writer.close();
  }

  console.log(`✅ Wrote split files: ${OUT_BASENAME}_partXXX${OUT_EXT}`);
}

main();
