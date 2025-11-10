// tools/buildMetaProject.ts
import fs from "fs";
import path from "path";
// === 設定 ===
var root = "./";
var dateDir = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
var outputDir = "./progress/".concat(dateDir);
var baseName = "sigmaris.mproj";
var maxLines = 10000;
// 除外ディレクトリ・ファイルパターン
var excludeDirs = [
    "node_modules",
    ".next",
    "dist",
    "logs",
    "coverage",
    "public",
    ".git",
];
var excludeFiles = [
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
function generateTree(dir, depth) {
    if (depth === void 0) { depth = 0; }
    var result = "";
    var prefix = "  ".repeat(depth);
    var _loop_1 = function (file) {
        var full = path.join(dir, file);
        if (excludeDirs.some(function (e) { return full.includes(e); }))
            return "continue";
        if (excludeFiles.some(function (e) { return full.includes(e); }))
            return "continue";
        var stat = fs.statSync(full);
        result += "".concat(prefix, "- ").concat(file, "\n");
        if (stat.isDirectory()) {
            result += generateTree(full, depth + 1);
        }
    };
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var file = _a[_i];
        _loop_1(file);
    }
    return result;
}
// === 再帰的にファイルを収集 ===
function collect(dir) {
    var result = "";
    var _loop_2 = function (file) {
        var full = path.join(dir, file);
        if (excludeDirs.some(function (e) { return full.includes(e); }))
            return "continue";
        if (excludeFiles.some(function (e) { return full.includes(e); }))
            return "continue";
        var stat = fs.statSync(full);
        if (stat.isDirectory()) {
            result += collect(full);
            return "continue";
        }
        if (/\.(ts|tsx|js|jsx|json|md)$/i.test(file)) {
            var content_1 = fs.readFileSync(full, "utf8");
            var lines = content_1.split("\n").length;
            result += "\n\n---\n### \uD83D\uDCC4 File: ".concat(full, "\n");
            result += "**Path:** `".concat(full, "`  \n**Lines:** ").concat(lines, "\n\n");
            result += "```" + file.split(".").pop() + "\n";
            result += content_1;
            result += "\n```\n---\n";
        }
    };
    for (var _i = 0, _a = fs.readdirSync(dir); _i < _a.length; _i++) {
        var file = _a[_i];
        _loop_2(file);
    }
    return result;
}
// === 出力処理 ===
function writeSplitFiles(content) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    var lines = content.split("\n");
    var fileIndex = 1;
    var chunk = [];
    for (var i = 0; i < lines.length; i++) {
        chunk.push(lines[i]);
        if (chunk.length >= maxLines || i === lines.length - 1) {
            var chunkFile = path.join(outputDir, "".concat(baseName, ".").concat(fileIndex, ".md"));
            fs.writeFileSync(chunkFile, chunk.join("\n"), "utf8");
            console.log("\uD83D\uDCDD Saved: ".concat(chunkFile, " (").concat(chunk.length, " lines)"));
            chunk = [];
            fileIndex++;
        }
    }
}
// === 実行 ===
console.log("🔍 Collecting project files...");
// 1. 階層ツリー作成
var tree = generateTree(root);
if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "directory-structure.txt"), tree, "utf8");
console.log("\uD83D\uDCC2 Directory structure saved: ".concat(outputDir, "/directory-structure.txt"));
// 2. コンテンツ収集
var content = collect(root);
writeSplitFiles(content);
console.log("\u2705 Meta project files generated in: ".concat(outputDir));
