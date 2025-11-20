"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// tools/buildMetaProject.ts
var fs_1 = require("fs");
var path_1 = require("path");
// === 設定 ===
var root = "./";
var outputDir = "./progress";
var baseName = "sigmaris.mproj";
var maxLines = 10000; // 1ファイルあたりの最大行数
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
// === 再帰的にファイルを収集 ===
function collect(dir) {
    var result = "";
    var _loop_1 = function (file) {
        var full = path_1.default.join(dir, file);
        if (excludeDirs.some(function (e) { return full.includes(e); }))
            return "continue";
        if (excludeFiles.some(function (e) { return full.includes(e); }))
            return "continue";
        var stat = fs_1.default.statSync(full);
        if (stat.isDirectory()) {
            result += collect(full);
            return "continue";
        }
        if (/\.(ts|tsx|js|jsx|json|md)$/i.test(file)) {
            var content_1 = fs_1.default.readFileSync(full, "utf8");
            var lines = content_1.split("\n").length;
            // Markdown形式でメタ情報を整える
            result += "\n\n---\n### \uD83D\uDCC4 File: ".concat(full, "\n");
            result += "**Path:** `".concat(full, "`  \n**Lines:** ").concat(lines, "\n\n");
            result += "```" + file.split(".").pop() + "\n";
            result += content_1;
            result += "\n```\n---\n";
        }
    };
    for (var _i = 0, _a = fs_1.default.readdirSync(dir); _i < _a.length; _i++) {
        var file = _a[_i];
        _loop_1(file);
    }
    return result;
}
// === 出力処理 ===
function writeSplitFiles(content) {
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir);
    }
    var lines = content.split("\n");
    var fileIndex = 1;
    var chunk = [];
    for (var i = 0; i < lines.length; i++) {
        chunk.push(lines[i]);
        if (chunk.length >= maxLines || i === lines.length - 1) {
            var chunkFile = path_1.default.join(outputDir, "".concat(baseName, ".").concat(fileIndex, ".md"));
            fs_1.default.writeFileSync(chunkFile, chunk.join("\n"));
            console.log("\uD83D\uDCDD Saved: ".concat(chunkFile, " (").concat(chunk.length, " lines)"));
            chunk = [];
            fileIndex++;
        }
    }
}
// === 実行 ===
console.log("🔍 Collecting project files...");
var content = collect(root);
writeSplitFiles(content);
console.log("\u2705 Meta project files (Markdown) generated in: ".concat(outputDir));
