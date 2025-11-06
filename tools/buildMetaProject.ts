// tools/buildMetaProject.ts
import fs from "fs";
import path from "path";

// === 設定 ===
const root = "./";
const dateDir = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
const outputDir = `./progress/${dateDir}`;
const baseName = "sigmaris.mproj";
const maxLines = 10000;

// 除外ディレクトリ・ファイルパターン
const excludeDirs = [
  "node_modules",
  ".next",
  "dist",
  "logs",
  "coverage",
  "public",
  ".git",
];

const excludeFiles = [
  "next.config.js",
  "next-env.d.ts",
  "vercel.json",
  ".eslintrc",
  ".eslintrc.js",
  ".prettierrc",
  ".prettierrc.js",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".spec.",
  ".test.",
  "jest.config",
  "tsconfig.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
];

// === ディレクトリツリー作成 ===
function generateTree(dir: string, depth = 0): string {
  let result = "";
  const prefix = "  ".repeat(depth);

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    if (excludeDirs.some((e) => full.includes(e))) continue;
    if (excludeFiles.some((e) => full.includes(e))) continue;

    const stat = fs.statSync(full);
    result += `${prefix}- ${file}\n`;

    if (stat.isDirectory()) {
      result += generateTree(full, depth + 1);
    }
  }
  return result;
}

// === 再帰的にファイルを収集 ===
function collect(dir: string): string {
  let result = "";

  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);

    if (excludeDirs.some((e) => full.includes(e))) continue;
    if (excludeFiles.some((e) => full.includes(e))) continue;

    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      result += collect(full);
      continue;
    }

    if (/\.(ts|tsx|js|jsx|json|md)$/i.test(file)) {
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n").length;

      result += `\n\n---\n### 📄 File: ${full}\n`;
      result += `**Path:** \`${full}\`  \n**Lines:** ${lines}\n\n`;
      result += "```" + file.split(".").pop() + "\n";
      result += content;
      result += "\n```\n---\n";
    }
  }
  return result;
}

// === 出力処理 ===
function writeSplitFiles(content: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const lines = content.split("\n");
  let fileIndex = 1;
  let chunk: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    chunk.push(lines[i]);
    if (chunk.length >= maxLines || i === lines.length - 1) {
      const chunkFile = path.join(outputDir, `${baseName}.${fileIndex}.md`);
      fs.writeFileSync(chunkFile, chunk.join("\n"), "utf8");
      console.log(`📝 Saved: ${chunkFile} (${chunk.length} lines)`);
      chunk = [];
      fileIndex++;
    }
  }
}

// === 実行 ===
console.log("🔍 Collecting project files...");

// 1. 階層ツリー作成
const tree = generateTree(root);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "directory-structure.txt"), tree, "utf8");
console.log(
  `📂 Directory structure saved: ${outputDir}/directory-structure.txt`
);

// 2. コンテンツ収集
const content = collect(root);
writeSplitFiles(content);

console.log(`✅ Meta project files generated in: ${outputDir}`);
