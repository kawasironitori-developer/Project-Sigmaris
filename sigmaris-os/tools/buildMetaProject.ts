// tools/buildMetaProject.ts
import fs from "fs";
import path from "path";

// === 設定 ===
const root = process.cwd(); // ← 実行ディレクトリを絶対パスで取得
const dateDir = new Date().toISOString().split("T")[0];
const outputDir = path.join(root, "progress", dateDir);
const baseName = "sigmaris.mproj";
const maxLines = 10000;

// === 除外設定（誤爆しないよう "prefixマッチ" に変更） ===
const excludeDirs = [
  "node_modules",
  ".next",
  "dist",
  "logs",
  "coverage",
  ".git",
  "public",
];

const excludeFiles = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "next.config.js",
  "tsconfig.json",
  "jest.config",
  ".eslintrc",
  ".prettierrc",
];

// === 安全チェック付き ===
function isExcludedDir(p: string) {
  return excludeDirs.some((name) => p.split(path.sep).includes(name));
}

function isExcludedFile(p: string) {
  return excludeFiles.some((name) => p.endsWith(name));
}

// === ディレクトリツリー作成 ===
function generateTree(dir: string, depth = 0): string {
  let result = "";
  const indent = "  ".repeat(depth);

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return ""; // 読めない場合はスキップ
  }

  for (const file of entries) {
    const full = path.join(dir, file);

    if (isExcludedDir(full) || isExcludedFile(full)) continue;

    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    result += `${indent}- ${file}\n`;

    if (stat.isDirectory()) {
      result += generateTree(full, depth + 1);
    }
  }

  return result;
}

// === ファイル内容収集 ===
function collect(dir: string): string {
  let buffer = "";

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return "";
  }

  for (const file of entries) {
    const full = path.join(dir, file);

    if (isExcludedDir(full) || isExcludedFile(full)) continue;

    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      buffer += collect(full);
      continue;
    }

    // 拾うファイル形式
    if (!/\.(ts|tsx|js|jsx|json|md)$/i.test(file)) continue;

    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n").length;

    buffer += `\n\n---\n### 📄 File: ${full}\n`;
    buffer += `**Path:** \`${full}\`\n**Lines:** ${lines}\n\n`;
    buffer += "```" + file.split(".").pop() + "\n";
    buffer += content;
    buffer += "\n```\n---\n";
  }

  return buffer;
}

// === 書き出し ===
function writeSplitFiles(content: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lines = content.split("\n");

  let idx = 1;
  let chunk: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    chunk.push(lines[i]);

    if (chunk.length >= maxLines || i === lines.length - 1) {
      const out = path.join(outputDir, `${baseName}.${idx}.md`);
      fs.writeFileSync(out, chunk.join("\n"), "utf8");
      console.log(`📝 Saved: ${out} (${chunk.length} lines)`);
      chunk = [];
      idx++;
    }
  }
}

// === 実行 ===
console.log("🔍 Collecting project files...");

// 1. ツリー書き込み
const tree = generateTree(root);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "directory-structure.txt"), tree, "utf8");
console.log(
  `📂 Directory structure saved: ${outputDir}/directory-structure.txt`
);

// 2. 内容収集
const content = collect(root);

// 3. 分割保存
writeSplitFiles(content);

console.log(`✅ Meta project files generated in: ${outputDir}`);
