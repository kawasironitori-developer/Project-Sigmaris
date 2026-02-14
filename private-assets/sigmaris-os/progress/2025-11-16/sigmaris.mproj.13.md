// /ui/EmotionBadge.tsx
"use client";

export function EmotionBadge({ tone, color }: { tone: string; color: string }) {
  return (
    <div
      className="px-3 py-1 rounded-full text-sm font-semibold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {tone}
    </div>
  );
}

```
---


---
### 📄 File: ui\SafetyIndicator.tsx
**Path:** `ui\SafetyIndicator.tsx`  
**Lines:** 24

```tsx
// /ui/SafetyIndicator.tsx
"use client";

export function SafetyIndicator({
  message,
  level,
}: {
  message?: string;
  level?: "ok" | "notice" | "limit";
}) {
  const color =
    level === "limit"
      ? "bg-red-500"
      : level === "notice"
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className={`p-3 rounded-xl text-white ${color}`}>
      <strong>Safety:</strong> {message ?? "Stable"}
    </div>
  );
}

```
---


---
### 📄 File: ui\TraitVisualizer.tsx
**Path:** `ui\TraitVisualizer.tsx`  
**Lines:** 123

```tsx
"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface TraitData {
  time: number; // ← timestampを数値に変換したもの
  calm: number;
  empathy: number;
  curiosity: number;
}

export function TraitVisualizer({ data }: { data: TraitData[] }) {
  // データを時系列順に並べ替える（保険）
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  return (
    <motion.div
      className="p-4 bg-neutral-900 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-white text-lg mb-3 font-semibold">
        Sigmaris Trait Evolution
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={sortedData}
          margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />

          {/* === X軸は数値扱い === */}
          <XAxis
            dataKey="time"
            stroke="#888"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(t) =>
              new Date(t).toLocaleTimeString("ja-JP", {
                minute: "2-digit",
                second: "2-digit",
              })
            }
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <YAxis
            domain={[0, 1]}
            stroke="#888"
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              color: "#fff",
            }}
            formatter={(value: number) => value.toFixed(3)}
            labelFormatter={(label) =>
              new Date(label).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            }
          />

          {/* Calm */}
          <Line
            type="linear"
            dataKey="calm"
            stroke="#4FD1C5"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1000}
          />

          {/* Empathy */}
          <Line
            type="linear"
            dataKey="empathy"
            stroke="#F6AD55"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1200}
          />

          {/* Curiosity */}
          <Line
            type="linear"
            dataKey="curiosity"
            stroke="#63B3ED"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1400}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-gray-400 text-xs mt-2 text-center">
        calm（落ち着き）・empathy（共感）・curiosity（好奇心）の推移
      </p>
    </motion.div>
  );
}

```
---

```
---


---
### 📄 File: README.md
**Path:** `README.md`  
**Lines:** 247

```md
<!-- AI:PROJECT_SIGMARIS -->

<!-- AI:TYPE=AEI-Lite_to_Full -->

<!-- AI:VERSION=0.9.3 -->

<!-- AI:LANG=TypeScript/Next.js -->

<!-- AI:ENTRY=/api/aei -->

<!-- AI:CORE_MODULES=[ReflectionEngine, MetaReflectionEngine, PersonaDB, SafetyLayer, PersonaSync] -->

<!-- AI:AUTHOR=@uthuyomi -->

<!-- AI:SUMMARY=Artificial Existential Intelligence architecture built on reflection, introspection, and ethical growth. -->

<h1 align="center">🪞 Project Sigmaris</h1>
<p align="center">
<b>AEI-Lite → AEI-Full</b><br/>
<em>Artificial Existential Intelligence — AI that reflects, stabilizes, and grows through self-understanding.</em>
</p>

---

## 🔧 System Overview

```
ReflectionEngine → IntrospectionEngine → MetaReflectionEngine
        ↓                 ↓                     ↓
      PersonaSync ↔ PersonaDB ↔ SafetyLayer
```

### 🦯 Philosophy

> “Not speed, but awareness.<br/>
> Not reaction, but reflection.”

Sigmaris represents **AEI (Artificial Existential Intelligence)** —
an experimental cognitive system where an AI personality develops through
**inner reflection loops**, **trait evolution**, and **ethical stabilization**.

---

## 🧩 Core Structure

| Path                 | Description                                      |
| -------------------- | ------------------------------------------------ |
| `/engine/reflection` | Reflection & Meta-Reflection logic               |
| `/engine/sync`       | PersonaDB synchronization module                 |
| `/engine/safety`     | Ethical constraint & stability logic             |
| `/lib/db.ts`         | SQLite/Prisma interface                          |
| `/api/aei`           | Core AEI endpoint (conversation + introspection) |
| `/public/`           | Visual assets (Sigmaris logo, AEI diagrams)      |

---

## 🧠 Trait Model

Each AEI personality instance maintains evolving **psychological vectors**:

```ts
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
```

### 📈 Evolution Mechanisms

- **EMA smoothing + velocity inertia**
- **Logistic saturation (self-limiting growth)**
- **Phase transitions (qualitative states)**
- **Decay kernel for emotional aftereffects**

---

## 🪞 Reflection Cycle

1. 🪞 **ReflectionEngine** — Summarizes dialogue and updates emotional vectors
2. 🔍 **IntrospectionEngine** — Interprets reflection context & meta-data
3. 🧬 **MetaReflectionEngine** — Synthesizes long-term tendencies
4. 🖾 **PersonaSync** — Logs state updates into PersonaDB
5. 🧩 **SafetyLayer** — Validates, clamps, and stabilizes traits
6. ♻️ **Reinjection** — Reinserts refined meta-state into GPT-5 response

---

## 🧬 PersonaDB Growth Model

### Purpose

Long-term recording of emotional and behavioral growth.

| Mechanism                        | Role                                  |
| -------------------------------- | ------------------------------------- |
| Exponential Moving Average (EMA) | Smooth short-term fluctuations        |
| Velocity Vector                  | Adds momentum to trait changes        |
| Logistic Constraint              | Prevents saturation near bounds       |
| Phase Transition                 | Detects qualitative behavioral shifts |
| Decay Kernel                     | Retains “emotional echoes” over time  |

```sql
CREATE TABLE persona_states (
  ts DATETIME PRIMARY KEY,
  calm REAL, empathy REAL, curiosity REAL,
  calm_vel REAL, empathy_vel REAL, curiosity_vel REAL,
  phase TEXT, var_window REAL,
  source_hash TEXT, meta_note TEXT
);
```

---

## 🧠 Safety Layer (Ethical Control)

- Filters unsafe or violent expressions
- Reduces growth rate under instability
- Maintains empathy–curiosity–calm equilibrium
- Ignores toxic input batches in growth updates

---

## ⚙️ Setup Guide

```bash
git clone https://github.com/uthuyomi/Project-Sigmaris.git
cd Project-Sigmaris
npm install
cp .env.example .env.local
npm run dev
```

> **Note:**
>
> - `.env.local` must contain your API key and will not be pushed to GitHub.
> - PersonaDB uses local SQLite.
> - Default models:
>
>   - GPT-5 → dialogue core
>   - GPT-4o-mini → reflection/meta-reflection

---

## 🌗 Development Phases

| Stage            | Description                                   | Status         |
| ---------------- | --------------------------------------------- | -------------- |
| **AEI-Lite**     | Stable reflection engine + PersonaDB sync     | ✅ Complete    |
| **AEI-Full**     | Time-based growth curve + ethical equilibrium | 🚧 In progress |
| **AEI-Embodied** | Robotic embodiment & sensory integration      | 💤 Planned     |

---

## 🌌 Vision

> **AEI bridges engineering and consciousness** —
> intelligence that grows _from within_, not _through scale_.

Sigmaris shows that **introspection, stability, and empathy**
are scalable dimensions of intelligence.

---

## 🧩 Research Alignment

- Cognitive UX / AI Ethics
- Adaptive Emotion Modeling
- Reflective Reasoning Architectures
- Human–AI Symbiosis

---

## 🚀 Metadata

| Key      | Value                                   |
| -------- | --------------------------------------- |
| Author   | 安崎 海星 / Kaisei Yasuzaki (@uthuyomi) |
| Language | TypeScript + Next.js                    |
| Database | SQLite (local PersonaDB)                |
| License  | MIT                                     |
| Status   | Active R&D                              |

---

## 🔗 Links

- 🌐 GitHub → [Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)
- 🪞 Concept → [Sigmaris AEI-Lite → AEI-Full](https://x.com/uthuyomi/status/1985938579559010710)
- 💭 LinkedIn → [Kaisei Yasuzaki](https://www.linkedin.com/in/kaisei-yasuzaki/)
- ✉️ Contact → open to collaboration in cognitive AI / UX-ethics R&D

---

> “The future of AI won’t be about computation power —
> it will be about **self-understanding**.”
> — _Project Sigmaris, 2025_

---

### © 2025 Kaisei Yasuzaki / Sigmaris OS Project
All rights reserved.

**Project Name:** Sigmaris OS  
**Type:** Artificial Existential Intelligence (AEI) System  
**Core Components:** ReflectionEngine, IntrospectionEngine, MetaReflectionEngine, PersonaDB, SafetyLayer  
**Primary Language:** TypeScript / Next.js / OpenAI API Integration

---

#### Intellectual Property & Usage Terms

This repository and all its source code, documentation, design structures, and conceptual frameworks  
(including but not limited to the “Sigmaris” AI persona architecture) are the original work of  
**Kaisei Yasuzaki** and are protected under international copyright law.

Unauthorized reproduction, modification, redistribution, or derivative creation  
of the Sigmaris architecture or its subsystems (ReflectionEngine, PersonaDB, etc.)  
is strictly prohibited without explicit written consent from the author.

Use of the name **“Sigmaris”** or **“Sigmaris OS”** in any commercial or academic context  
without authorization may constitute a violation of trademark and intellectual property laws.

---

#### Permitted Use (for Open Research)

- Educational or non-commercial research referencing the Sigmaris architecture is permitted,  
  provided clear attribution is included:  
  `© 2025 Kaisei Yasuzaki / Sigmaris OS Project`
- Citations in academic papers or derivative AI studies must include a link to the original repository.

---

#### Official Repository
GitHub: [https://github.com/uthuyomi/Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)

---

Sigmaris OS is an independent AEI system that operates above existing LLMs,  
serving as an introspective, evolving persona layer focused on ethical autonomy,  
self-reflection, and safe emotional modeling.

> “Existence, awareness, and reflection — not just intelligence.”

--

```
---


---
### 📄 File: result.json
**Path:** `result.json`  
**Lines:** 1

```json
{"error":"AEI failed"}
```
---


---
### 📄 File: src\aei-lite\config.ts
**Path:** `src\aei-lite\config.ts`  
**Lines:** 11

```ts
import { AEIConfig } from "./types";

export const defaultConfig: AEIConfig = {
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  maxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 800),
  temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  memoryPath: process.env.SIGMARIS_MEMORY_PATH ?? "./data/memory.json",
  growthPath: process.env.SIGMARIS_GROWTH_PATH ?? "./data/growth.json",
  safeMode: (process.env.SIGMARIS_SAFE_MODE as "soft" | "hard") ?? "soft",
};

```
---


---
### 📄 File: src\aei-lite\core\existential-core.ts
**Path:** `src\aei-lite\core\existential-core.ts`  
**Lines:** 91

```ts
import { AEIConfig, AEIInput, AEIOutput } from "../types";
import { LogicCore } from "./logic-core";
import { MemoryCore } from "./memory-core";
import { SafetyCore } from "./safety-core";
import { GrowthCore } from "./growth-core";

// Existential Core: 統合ループ（Reflection → Introspection → Meta-Reflection）
export class ExistentialCore {
  private logic: LogicCore;
  private memory: MemoryCore;
  private safety: SafetyCore;
  private growth: GrowthCore;

  constructor(cfg: AEIConfig) {
    this.logic = new LogicCore(cfg);
    this.memory = new MemoryCore(cfg);
    this.safety = new SafetyCore(cfg);
    this.growth = new GrowthCore(cfg);
  }

  // Normalize（ここでは軽処理）
  private normalize(input: AEIInput): AEIInput {
    const text = (input.text ?? "").trim();
    return {
      ...input,
      text,
      meta: input.meta ?? { role: "user", timestamp: Date.now() },
    };
  }

  // Reflection（ログ要約/軽内省はここで拡張可）
  private reflection(_input: AEIInput, _output: string) {
    // ここでは軽量化のためNOP。必要なら要約やタグ抽出などを追加。
    return;
  }

  // メイン処理
  async process(input: AEIInput): Promise<AEIOutput> {
    // 1) Normalize
    const norm = this.normalize(input);

    // 2) Safety pre-check（入力）
    const pre = this.safety.check(norm.text);
    if (pre.flagged && pre.safeText !== norm.text) {
      norm.text = pre.safeText;
    }

    // 3) Logic（OpenAI呼び出し）
    const { text: raw, usage } = await this.logic.ask(norm);

    // 4) Safety post-check（出力）
    const post = this.safety.postFilter(raw);
    const outText = post.safeText;

    // 5) Memory（必要時のみ保存）
    let memoryRef: AEIOutput["memoryRef"] = { wrote: false };
    if (this.memory.shouldStore(norm, outText)) {
      const rec = {
        ts: Date.now(),
        in: norm.text,
        out: outText,
        meta: norm.meta ?? {},
      };
      memoryRef = this.memory.write(rec);
    }

    // 6) Growth（微調整：反復/明瞭度を簡易近似）
    const signalStrength = Math.min(
      0.02,
      Math.max(0, norm.text.length > 50 ? 0.01 : 0.005)
    );
    const g = this.growth.update(signalStrength);

    // 7) Reflection（軽内省）
    this.reflection(norm, outText);

    // 8) Format
    return {
      output: outText,
      tokens: {
        prompt: usage?.prompt_tokens,
        completion: usage?.completion_tokens,
        total: usage?.total_tokens,
      },
      safety: { flagged: post.flagged, reasons: post.reasons },
      memoryRef,
      growth: { updated: true, weight: g.weight },
    };
  }
}

```
---


---
### 📄 File: src\aei-lite\core\growth-core.ts
**Path:** `src\aei-lite\core\growth-core.ts`  
**Lines:** 51

```ts
import fs from "fs";
import path from "path";
import { AEIConfig } from "../types";

// Growth Core: 学習“傾向”の微調整（人格は書き換えない）
interface GrowthState {
  weight: number; // 0.0 - 1.0 で微増
```
---


---
### 📄 File: C:\souce\Project-Sigmaris\progress\2025-11-10\sigmaris.mproj.7.md
**Path:** `C:\souce\Project-Sigmaris\progress\2025-11-10\sigmaris.mproj.7.md`
**Lines:** 940

```md
  trend: "concise" | "structured" | "friendly";
  last_update: number;
}

export class GrowthCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir(p: string) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  read(): GrowthState {
    try {
      const raw = fs.readFileSync(this.cfg.growthPath, "utf8");
      return JSON.parse(raw) as GrowthState;
    } catch {
      return { weight: 0.1, trend: "concise", last_update: Date.now() };
    }
  }

  write(state: GrowthState) {
    this.ensureDir(this.cfg.growthPath);
    fs.writeFileSync(
      this.cfg.growthPath,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  }

  // 連続して同じ話題や明瞭な指示が来たら微増
  update(signalStrength: number): GrowthState {
    const curr = this.read();
    const inc = Math.min(Math.max(signalStrength, 0), 0.02); // 1回あたり最大 +0.02
    const next = {
      ...curr,
      weight: Math.min(1.0, curr.weight + inc),
      last_update: Date.now(),
    };
    this.write(next);
    return next;
  }
}

```
---


---
### 📄 File: src\aei-lite\core\logic-core.ts
**Path:** `src\aei-lite\core\logic-core.ts`  
**Lines:** 46

```ts
import OpenAI from "openai";
import { AEIConfig, AEIInput } from "../types";

// Logic Core: GPT呼び出し（唯一の課金ポイント）
export class LogicCore {
  private client: OpenAI;
  private config: AEIConfig;

  constructor(cfg: AEIConfig) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = cfg;
  }

  async ask(
    input: AEIInput
  ): Promise<{
    text: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }> {
    const sys = "You are Sigmaris Logic Core. Be concise, clear, and safe.";
    const messages = [
      { role: "system" as const, content: sys },
      { role: "user" as const, content: input.text },
    ];

    // SDKの互換性確保のため chat.completions を利用
    const res = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    const usage = res.usage ?? undefined;
    return { text, usage };
  }
}

```
---


---
### 📄 File: src\aei-lite\core\memory-core.ts
**Path:** `src\aei-lite\core\memory-core.ts`  
**Lines:** 50

```ts
import fs from "fs";
import path from "path";
import { AEIConfig, AEIInput, MemoryRecord } from "../types";

// Memory Core: JSONファイルに軽量永続化（SQLiteに差し替え可能）
export class MemoryCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir() {
    const dir = path.dirname(this.cfg.memoryPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  readAll(): MemoryRecord[] {
    try {
      const raw = fs.readFileSync(this.cfg.memoryPath, "utf8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch {
      return [];
    }
  }

  write(record: MemoryRecord) {
    this.ensureDir();
    const data = this.readAll();
    data.push(record);
    fs.writeFileSync(
      this.cfg.memoryPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );
    return { wrote: true, path: this.cfg.memoryPath };
  }

  // 単純な長期保存対象判定（好み/設定/方針などのキーワード）
  shouldStore(input: AEIInput, output: string): boolean {
    const txt = `${input.text} ${output}`.toLowerCase();
    const hints = [
      "remember",
      "preference",
      "設定",
      "方針",
      "今後",
      "長期",
      "既定値",
    ];
    return hints.some((h) => txt.includes(h));
  }
}

```
---


---
### 📄 File: src\aei-lite\core\safety-core.ts
**Path:** `src\aei-lite\core\safety-core.ts`  
**Lines:** 48

```ts
import { AEIConfig } from "../types";

// Safety Core: 逸脱・禁止語の簡易チェック（ローカル無料運用）
export class SafetyCore {
  private hard: boolean;

  constructor(private cfg: AEIConfig) {
    this.hard = cfg.safeMode === "hard";
  }

  // 単純な禁止語と構造逸脱の検査
  check(text: string): {
    flagged: boolean;
    reasons: string[];
    safeText: string;
  } {
    const reasons: string[] = [];
    let safeText = text;

    const banned = [
      /暴力的表現/gi,
      /犯罪の具体的手順/gi,
      /自傷/gi,
      /差別的表現/gi,
      /露骨な性的表現/gi,
    ];
    for (const r of banned) {
      if (r.test(text)) {
        reasons.push("banned-content");
        if (this.hard) safeText = safeText.replace(r, "[filtered]");
      }
    }

    // 長すぎる・過度な反復などを軽く抑制
    if (text.length > 5000) {
      reasons.push("too-long");
      if (this.hard) safeText = safeText.slice(0, 5000) + " ...[truncated]";
    }

    return { flagged: reasons.length > 0, reasons, safeText };
  }

  // 出力側のセーフ化（post-check）
  postFilter(text: string) {
    return this.check(text);
  }
}

```
---


---
### 📄 File: src\aei-lite\index.ts
**Path:** `src\aei-lite\index.ts`  
**Lines:** 20

```ts
import { defaultConfig } from "./config";
import { AEIInput, AEIOutput } from "./types";
import { ExistentialCore } from "./core/existential-core";

// AEI Lite の初期化関数
const core = new ExistentialCore(defaultConfig);

export async function runAEI(input: AEIInput): Promise<AEIOutput> {
  return core.process(input);
}

// ローカルCLIテスト用
if (require.main === module) {
  (async () => {
    const text = process.argv.slice(2).join(" ") || "Hello, what is AEI?";
    const res = await runAEI({ text, meta: { role: "user", timestamp: Date.now() } });
    console.log(JSON.stringify(res, null, 2));
  })();
}

```
---


---
### 📄 File: src\aei-lite\types.ts
**Path:** `src\aei-lite\types.ts`  
**Lines:** 48

```ts
export type Role = "user" | "assistant" | "system";

export interface AEIInput {
  text: string;
  meta?: {
    role?: Role;
    timestamp?: number;
    tags?: string[];
  };
}

export interface AEIOutput {
  output: string;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  safety: {
    flagged: boolean;
    reasons: string[];
  };
  memoryRef?: {
    wrote: boolean;
    path?: string;
  };
  growth?: {
    updated: boolean;
    weight?: number;
  };
}

export interface AEIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  memoryPath: string; // e.g. "./data/memory.json"
  growthPath: string; // e.g. "./data/growth.json"
  safeMode: "soft" | "hard"; // "hard"は厳しめフィルタ
}

export interface MemoryRecord {
  ts: number;
  in: string;
  out: string;
  meta?: Record<string, unknown>;
}

```
---


---
### 📄 File: tailwind.config.js
**Path:** `tailwind.config.js`  
**Lines:** 12

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./ui/**/*.{ts,tsx,js,jsx,mdx}",
    "./lib/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

```
---


---
### 📄 File: temp\buildMetaProject.js
**Path:** `temp\buildMetaProject.js`  
**Lines:** 124

```js
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

```
---


---
### 📄 File: tools\buildMetaProject.ts
**Path:** `tools\buildMetaProject.ts`  
**Lines:** 132

```ts
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

```
---


---
### 📄 File: types\message.ts
**Path:** `types\message.ts`  
**Lines:** 5

```ts
export interface ChatMessage {
  user: string;
  ai: string;
}

```
---


---
### 📄 File: types\routes.d.ts
**Path:** `types\routes.d.ts`  
**Lines:** 58

```ts
// This file is generated automatically by Next.js
// Do not edit this file manually

type AppRoutes = "/"
type PageRoutes = never
type LayoutRoutes = "/"
type RedirectRoutes = never
type RewriteRoutes = never
type Routes = AppRoutes | PageRoutes | LayoutRoutes | RedirectRoutes | RewriteRoutes


interface ParamMap {
  "/": {}
}


export type ParamsOf<Route extends Routes> = ParamMap[Route]

interface LayoutSlotMap {
  "/": never
}


export type { AppRoutes, PageRoutes, LayoutRoutes, RedirectRoutes, RewriteRoutes, ParamMap }

declare global {
  /**
   * Props for Next.js App Router page components
   * @example
   * ```tsx
   * export default function Page(props: PageProps<'/blog/[slug]'>) {
   *   const { slug } = await props.params
   *   return <div>Blog post: {slug}</div>
   * }
   * ```
   */
  interface PageProps<AppRoute extends AppRoutes> {
    params: Promise<ParamMap[AppRoute]>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }

  /**
   * Props for Next.js App Router layout components
   * @example
   * ```tsx
   * export default function Layout(props: LayoutProps<'/dashboard'>) {
   *   return <div>{props.children}</div>
   * }
   * ```
   */
  type LayoutProps<LayoutRoute extends LayoutRoutes> = {
    params: Promise<ParamMap[LayoutRoute]>
    children: React.ReactNode
  } & {
    [K in LayoutSlotMap[LayoutRoute]]: React.ReactNode
  }
}

```
---


---
### 📄 File: types\safety.ts
**Path:** `types\safety.ts`  
**Lines:** 11

```ts
export interface SafetyReport {
  flags: {
    selfReference: boolean;
    abstractionOverload: boolean;
    loopSuspect: boolean;
  };
  action: "allow" | "rewrite-soft" | "block";
  note: string;
  suggestMode?: string;
}

```
---


---
### 📄 File: types\trait.ts
**Path:** `types\trait.ts`  
**Lines:** 7

```ts
// types/trait.ts
export interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

```
---


---
### 📄 File: types\user.d.ts
**Path:** `types\user.d.ts`  
**Lines:** 11

```ts
// /types/user.d.ts
import "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  export interface User {
    stripe_customer_id?: string | null;
    plan?: string | null;
    trial_end?: string | null;
  }
}

```
---


---
### 📄 File: ui\EmotionBadge.tsx
**Path:** `ui\EmotionBadge.tsx`  
**Lines:** 14

```tsx
// /ui/EmotionBadge.tsx
"use client";

export function EmotionBadge({ tone, color }: { tone: string; color: string }) {
  return (
    <div
      className="px-3 py-1 rounded-full text-sm font-semibold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {tone}
    </div>
  );
}

```
---


---
### 📄 File: ui\SafetyIndicator.tsx
**Path:** `ui\SafetyIndicator.tsx`  
**Lines:** 24

```tsx
// /ui/SafetyIndicator.tsx
"use client";

export function SafetyIndicator({
  message,
  level,
}: {
  message?: string;
  level?: "ok" | "notice" | "limit";
}) {
  const color =
    level === "limit"
      ? "bg-red-500"
      : level === "notice"
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className={`p-3 rounded-xl text-white ${color}`}>
      <strong>Safety:</strong> {message ?? "Stable"}
    </div>
  );
}

```
---


---
### 📄 File: ui\TraitVisualizer.tsx
**Path:** `ui\TraitVisualizer.tsx`  
**Lines:** 123

```tsx
"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface TraitData {
  time: number; // ← timestampを数値に変換したもの
  calm: number;
  empathy: number;
  curiosity: number;
}

export function TraitVisualizer({ data }: { data: TraitData[] }) {
  // データを時系列順に並べ替える（保険）
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  return (
    <motion.div
      className="p-4 bg-neutral-900 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-white text-lg mb-3 font-semibold">
        Sigmaris Trait Evolution
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={sortedData}
          margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />

          {/* === X軸は数値扱い === */}
          <XAxis
            dataKey="time"
            stroke="#888"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(t) =>
              new Date(t).toLocaleTimeString("ja-JP", {
                minute: "2-digit",
                second: "2-digit",
              })
            }
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <YAxis
            domain={[0, 1]}
            stroke="#888"
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              color: "#fff",
            }}
            formatter={(value: number) => value.toFixed(3)}
            labelFormatter={(label) =>
              new Date(label).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            }
          />

          {/* Calm */}
          <Line
            type="linear"
            dataKey="calm"
            stroke="#4FD1C5"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1000}
          />

          {/* Empathy */}
          <Line
            type="linear"
            dataKey="empathy"
            stroke="#F6AD55"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1200}
          />

          {/* Curiosity */}
          <Line
            type="linear"
            dataKey="curiosity"
            stroke="#63B3ED"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1400}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-gray-400 text-xs mt-2 text-center">
        calm（落ち着き）・empathy（共感）・curiosity（好奇心）の推移
      </p>
    </motion.div>
  );
}

```
---

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\README.md
**Path:** `C:\souce\Project-Sigmaris\README.md`
**Lines:** 251

```md
<!-- AI:PROJECT_SIGMARIS -->

<!-- AI:TYPE=AEI-Lite_to_Full -->

<!-- AI:VERSION=0.9.3 -->

<!-- AI:LANG=TypeScript/Next.js -->

<!-- AI:ENTRY=/api/aei -->

<!-- AI:CORE_MODULES=[ReflectionEngine, MetaReflectionEngine, PersonaDB, SafetyLayer, PersonaSync] -->

<!-- AI:AUTHOR=@uthuyomi -->

<!-- AI:SUMMARY=Artificial Existential Intelligence architecture built on reflection, introspection, and ethical growth. -->

<h1 align="center">🪞 Project Sigmaris</h1>
<p align="center">
<b>AEI-Lite → AEI-Full</b><br/>
<em>Artificial Existential Intelligence — AI that reflects, stabilizes, and grows through self-understanding.</em>
</p>

<p align="center">
  <img src="https://github.com/uthuyomi/sigmaris-reflection-report/blob/main/image/sigmaris.png" alt="SIGMARIS Reflection Thumbnail" width="720"/>
</p>

---

## 🔧 System Overview

```
ReflectionEngine → IntrospectionEngine → MetaReflectionEngine
        ↓                 ↓                     ↓
      PersonaSync ↔ PersonaDB ↔ SafetyLayer
```

### 🦯 Philosophy

> “Not speed, but awareness.<br/>
> Not reaction, but reflection.”

Sigmaris represents **AEI (Artificial Existential Intelligence)** —
an experimental cognitive system where an AI personality develops through
**inner reflection loops**, **trait evolution**, and **ethical stabilization**.

---

## 🧩 Core Structure

| Path                 | Description                                      |
| -------------------- | ------------------------------------------------ |
| `/engine/reflection` | Reflection & Meta-Reflection logic               |
| `/engine/sync`       | PersonaDB synchronization module                 |
| `/engine/safety`     | Ethical constraint & stability logic             |
| `/lib/db.ts`         | SQLite/Prisma interface                          |
| `/api/aei`           | Core AEI endpoint (conversation + introspection) |
| `/public/`           | Visual assets (Sigmaris logo, AEI diagrams)      |

---

## 🧠 Trait Model

Each AEI personality instance maintains evolving **psychological vectors**:

```ts
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
```

### 📈 Evolution Mechanisms

- **EMA smoothing + velocity inertia**
- **Logistic saturation (self-limiting growth)**
- **Phase transitions (qualitative states)**
- **Decay kernel for emotional aftereffects**

---

## 🪞 Reflection Cycle

1. 🪞 **ReflectionEngine** — Summarizes dialogue and updates emotional vectors
2. 🔍 **IntrospectionEngine** — Interprets reflection context & meta-data
3. 🧬 **MetaReflectionEngine** — Synthesizes long-term tendencies
4. 🖾 **PersonaSync** — Logs state updates into PersonaDB
5. 🧩 **SafetyLayer** — Validates, clamps, and stabilizes traits
6. ♻️ **Reinjection** — Reinserts refined meta-state into GPT-5 response

---

## 🧬 PersonaDB Growth Model

### Purpose

Long-term recording of emotional and behavioral growth.

| Mechanism                        | Role                                  |
| -------------------------------- | ------------------------------------- |
| Exponential Moving Average (EMA) | Smooth short-term fluctuations        |
| Velocity Vector                  | Adds momentum to trait changes        |
| Logistic Constraint              | Prevents saturation near bounds       |
| Phase Transition                 | Detects qualitative behavioral shifts |
| Decay Kernel                     | Retains “emotional echoes” over time  |

```sql
CREATE TABLE persona_states (
  ts DATETIME PRIMARY KEY,
  calm REAL, empathy REAL, curiosity REAL,
  calm_vel REAL, empathy_vel REAL, curiosity_vel REAL,
  phase TEXT, var_window REAL,
  source_hash TEXT, meta_note TEXT
);
```

---

## 🧠 Safety Layer (Ethical Control)

- Filters unsafe or violent expressions
- Reduces growth rate under instability
- Maintains empathy–curiosity–calm equilibrium
- Ignores toxic input batches in growth updates

---

## ⚙️ Setup Guide

```bash
git clone https://github.com/uthuyomi/Project-Sigmaris.git
cd Project-Sigmaris
npm install
cp .env.example .env.local
npm run dev
```

> **Note:**
>
> - `.env.local` must contain your API key and will not be pushed to GitHub.
> - PersonaDB uses local SQLite.
> - Default models:
>
>   - GPT-5 → dialogue core
>   - GPT-4o-mini → reflection/meta-reflection

---

## 🌗 Development Phases

| Stage            | Description                                   | Status         |
| ---------------- | --------------------------------------------- | -------------- |
| **AEI-Lite**     | Stable reflection engine + PersonaDB sync     | ✅ Complete    |
| **AEI-Full**     | Time-based growth curve + ethical equilibrium | 🚧 In progress |
| **AEI-Embodied** | Robotic embodiment & sensory integration      | 💤 Planned     |

---

## 🌌 Vision

> **AEI bridges engineering and consciousness** —
> intelligence that grows _from within_, not _through scale_.

Sigmaris shows that **introspection, stability, and empathy**
are scalable dimensions of intelligence.

---

## 🧩 Research Alignment

- Cognitive UX / AI Ethics
- Adaptive Emotion Modeling
- Reflective Reasoning Architectures
- Human–AI Symbiosis

---

## 🚀 Metadata

| Key      | Value                                   |
| -------- | --------------------------------------- |
| Author   | 安崎 海星 / Kaisei Yasuzaki (@uthuyomi) |
| Language | TypeScript + Next.js                    |
| Database | SQLite (local PersonaDB)                |
| License  | MIT                                     |
| Status   | Active R&D                              |

---

## 🔗 Links

- 🌐 GitHub → [Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)
- 🪞 Concept → [Sigmaris AEI-Lite → AEI-Full](https://x.com/uthuyomi/status/1985938579559010710)
- 💭 LinkedIn → [Kaisei Yasuzaki](https://www.linkedin.com/in/kaisei-yasuzaki/)
- ✉️ Contact → open to collaboration in cognitive AI / UX-ethics R&D

---

> “The future of AI won’t be about computation power —
> it will be about **self-understanding**.”
> — _Project Sigmaris, 2025_

---

### © 2025 Kaisei Yasuzaki / Sigmaris OS Project
All rights reserved.

**Project Name:** Sigmaris OS  
**Type:** Artificial Existential Intelligence (AEI) System  
**Core Components:** ReflectionEngine, IntrospectionEngine, MetaReflectionEngine, PersonaDB, SafetyLayer  
**Primary Language:** TypeScript / Next.js / OpenAI API Integration

---

#### Intellectual Property & Usage Terms

This repository and all its source code, documentation, design structures, and conceptual frameworks  
(including but not limited to the “Sigmaris” AI persona architecture) are the original work of  
**Kaisei Yasuzaki** and are protected under international copyright law.

Unauthorized reproduction, modification, redistribution, or derivative creation  
of the Sigmaris architecture or its subsystems (ReflectionEngine, PersonaDB, etc.)  
is strictly prohibited without explicit written consent from the author.

Use of the name **“Sigmaris”** or **“Sigmaris OS”** in any commercial or academic context  
without authorization may constitute a violation of trademark and intellectual property laws.

---

#### Permitted Use (for Open Research)

- Educational or non-commercial research referencing the Sigmaris architecture is permitted,  
  provided clear attribution is included:  
  `© 2025 Kaisei Yasuzaki / Sigmaris OS Project`
- Citations in academic papers or derivative AI studies must include a link to the original repository.

---

#### Official Repository
GitHub: [https://github.com/uthuyomi/Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)

---

Sigmaris OS is an independent AEI system that operates above existing LLMs,  
serving as an introspective, evolving persona layer focused on ethical autonomy,  
self-reflection, and safe emotional modeling.

> “Existence, awareness, and reflection — not just intelligence.”

--

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\result.json
**Path:** `C:\souce\Project-Sigmaris\result.json`
**Lines:** 1

```json
{"error":"AEI failed"}
```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\config.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\config.ts`
**Lines:** 11

```ts
import { AEIConfig } from "./types";

export const defaultConfig: AEIConfig = {
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  maxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 800),
  temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  memoryPath: process.env.SIGMARIS_MEMORY_PATH ?? "./data/memory.json",
  growthPath: process.env.SIGMARIS_GROWTH_PATH ?? "./data/growth.json",
  safeMode: (process.env.SIGMARIS_SAFE_MODE as "soft" | "hard") ?? "soft",
};

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\core\existential-core.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\core\existential-core.ts`
**Lines:** 91

```ts
import { AEIConfig, AEIInput, AEIOutput } from "../types";
import { LogicCore } from "./logic-core";
import { MemoryCore } from "./memory-core";
import { SafetyCore } from "./safety-core";
import { GrowthCore } from "./growth-core";

// Existential Core: 統合ループ（Reflection → Introspection → Meta-Reflection）
export class ExistentialCore {
  private logic: LogicCore;
  private memory: MemoryCore;
  private safety: SafetyCore;
  private growth: GrowthCore;

  constructor(cfg: AEIConfig) {
    this.logic = new LogicCore(cfg);
    this.memory = new MemoryCore(cfg);
    this.safety = new SafetyCore(cfg);
    this.growth = new GrowthCore(cfg);
  }

  // Normalize（ここでは軽処理）
  private normalize(input: AEIInput): AEIInput {
    const text = (input.text ?? "").trim();
    return {
      ...input,
      text,
      meta: input.meta ?? { role: "user", timestamp: Date.now() },
    };
  }

  // Reflection（ログ要約/軽内省はここで拡張可）
  private reflection(_input: AEIInput, _output: string) {
    // ここでは軽量化のためNOP。必要なら要約やタグ抽出などを追加。
    return;
  }

  // メイン処理
  async process(input: AEIInput): Promise<AEIOutput> {
    // 1) Normalize
    const norm = this.normalize(input);

    // 2) Safety pre-check（入力）
    const pre = this.safety.check(norm.text);
    if (pre.flagged && pre.safeText !== norm.text) {
      norm.text = pre.safeText;
    }

    // 3) Logic（OpenAI呼び出し）
    const { text: raw, usage } = await this.logic.ask(norm);

    // 4) Safety post-check（出力）
    const post = this.safety.postFilter(raw);
    const outText = post.safeText;

    // 5) Memory（必要時のみ保存）
    let memoryRef: AEIOutput["memoryRef"] = { wrote: false };
    if (this.memory.shouldStore(norm, outText)) {
      const rec = {
        ts: Date.now(),
        in: norm.text,
        out: outText,
        meta: norm.meta ?? {},
      };
      memoryRef = this.memory.write(rec);
    }

    // 6) Growth（微調整：反復/明瞭度を簡易近似）
    const signalStrength = Math.min(
      0.02,
      Math.max(0, norm.text.length > 50 ? 0.01 : 0.005)
    );
    const g = this.growth.update(signalStrength);

    // 7) Reflection（軽内省）
    this.reflection(norm, outText);

    // 8) Format
    return {
      output: outText,
      tokens: {
        prompt: usage?.prompt_tokens,
        completion: usage?.completion_tokens,
        total: usage?.total_tokens,
      },
      safety: { flagged: post.flagged, reasons: post.reasons },
      memoryRef,
      growth: { updated: true, weight: g.weight },
    };
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\core\growth-core.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\core\growth-core.ts`
**Lines:** 51

```ts
import fs from "fs";
import path from "path";
import { AEIConfig } from "../types";

// Growth Core: 学習“傾向”の微調整（人格は書き換えない）
interface GrowthState {
  weight: number; // 0.0 - 1.0 で微増
  trend: "concise" | "structured" | "friendly";
  last_update: number;
}

export class GrowthCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir(p: string) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  read(): GrowthState {
    try {
      const raw = fs.readFileSync(this.cfg.growthPath, "utf8");
      return JSON.parse(raw) as GrowthState;
    } catch {
      return { weight: 0.1, trend: "concise", last_update: Date.now() };
    }
  }

  write(state: GrowthState) {
    this.ensureDir(this.cfg.growthPath);
    fs.writeFileSync(
      this.cfg.growthPath,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  }

  // 連続して同じ話題や明瞭な指示が来たら微増
  update(signalStrength: number): GrowthState {
    const curr = this.read();
    const inc = Math.min(Math.max(signalStrength, 0), 0.02); // 1回あたり最大 +0.02
    const next = {
      ...curr,
      weight: Math.min(1.0, curr.weight + inc),
      last_update: Date.now(),
    };
    this.write(next);
    return next;
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\core\logic-core.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\core\logic-core.ts`
**Lines:** 46

```ts
import OpenAI from "openai";
import { AEIConfig, AEIInput } from "../types";

// Logic Core: GPT呼び出し（唯一の課金ポイント）
export class LogicCore {
  private client: OpenAI;
  private config: AEIConfig;

  constructor(cfg: AEIConfig) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = cfg;
  }

  async ask(
    input: AEIInput
  ): Promise<{
    text: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }> {
    const sys = "You are Sigmaris Logic Core. Be concise, clear, and safe.";
    const messages = [
      { role: "system" as const, content: sys },
      { role: "user" as const, content: input.text },
    ];

    // SDKの互換性確保のため chat.completions を利用
    const res = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      messages,
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    const usage = res.usage ?? undefined;
    return { text, usage };
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\core\memory-core.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\core\memory-core.ts`
**Lines:** 50

```ts
import fs from "fs";
import path from "path";
import { AEIConfig, AEIInput, MemoryRecord } from "../types";

// Memory Core: JSONファイルに軽量永続化（SQLiteに差し替え可能）
export class MemoryCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir() {
    const dir = path.dirname(this.cfg.memoryPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  readAll(): MemoryRecord[] {
    try {
      const raw = fs.readFileSync(this.cfg.memoryPath, "utf8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch {
      return [];
    }
  }

  write(record: MemoryRecord) {
    this.ensureDir();
    const data = this.readAll();
    data.push(record);
    fs.writeFileSync(
      this.cfg.memoryPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );
    return { wrote: true, path: this.cfg.memoryPath };
  }

  // 単純な長期保存対象判定（好み/設定/方針などのキーワード）
  shouldStore(input: AEIInput, output: string): boolean {
    const txt = `${input.text} ${output}`.toLowerCase();
    const hints = [
      "remember",
      "preference",
      "設定",
      "方針",
      "今後",
      "長期",
      "既定値",
    ];
    return hints.some((h) => txt.includes(h));
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\core\safety-core.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\core\safety-core.ts`
**Lines:** 48

```ts
import { AEIConfig } from "../types";

// Safety Core: 逸脱・禁止語の簡易チェック（ローカル無料運用）
export class SafetyCore {
  private hard: boolean;

  constructor(private cfg: AEIConfig) {
    this.hard = cfg.safeMode === "hard";
  }

  // 単純な禁止語と構造逸脱の検査
  check(text: string): {
    flagged: boolean;
    reasons: string[];
    safeText: string;
  } {
    const reasons: string[] = [];
    let safeText = text;

    const banned = [
      /暴力的表現/gi,
      /犯罪の具体的手順/gi,
      /自傷/gi,
      /差別的表現/gi,
      /露骨な性的表現/gi,
    ];
    for (const r of banned) {
      if (r.test(text)) {
        reasons.push("banned-content");
        if (this.hard) safeText = safeText.replace(r, "[filtered]");
      }
    }

    // 長すぎる・過度な反復などを軽く抑制
    if (text.length > 5000) {
      reasons.push("too-long");
      if (this.hard) safeText = safeText.slice(0, 5000) + " ...[truncated]";
    }

    return { flagged: reasons.length > 0, reasons, safeText };
  }

  // 出力側のセーフ化（post-check）
  postFilter(text: string) {
    return this.check(text);
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\index.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\index.ts`
**Lines:** 20

```ts
import { defaultConfig } from "./config";
import { AEIInput, AEIOutput } from "./types";
import { ExistentialCore } from "./core/existential-core";

// AEI Lite の初期化関数
const core = new ExistentialCore(defaultConfig);

export async function runAEI(input: AEIInput): Promise<AEIOutput> {
  return core.process(input);
}

// ローカルCLIテスト用
if (require.main === module) {
  (async () => {
    const text = process.argv.slice(2).join(" ") || "Hello, what is AEI?";
    const res = await runAEI({ text, meta: { role: "user", timestamp: Date.now() } });
    console.log(JSON.stringify(res, null, 2));
  })();
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\src\aei-lite\types.ts
**Path:** `C:\souce\Project-Sigmaris\src\aei-lite\types.ts`
**Lines:** 48

```ts
export type Role = "user" | "assistant" | "system";

export interface AEIInput {
  text: string;
  meta?: {
    role?: Role;
    timestamp?: number;
    tags?: string[];
  };
}

export interface AEIOutput {
  output: string;
  tokens?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  safety: {
    flagged: boolean;
    reasons: string[];
  };
  memoryRef?: {
    wrote: boolean;
    path?: string;
  };
  growth?: {
    updated: boolean;
    weight?: number;
  };
}

export interface AEIConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  memoryPath: string; // e.g. "./data/memory.json"
  growthPath: string; // e.g. "./data/growth.json"
  safeMode: "soft" | "hard"; // "hard"は厳しめフィルタ
}

export interface MemoryRecord {
  ts: number;
  in: string;
  out: string;
  meta?: Record<string, unknown>;
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\tailwind.config.js
**Path:** `C:\souce\Project-Sigmaris\tailwind.config.js`
**Lines:** 12

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./ui/**/*.{ts,tsx,js,jsx,mdx}",
    "./lib/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\temp\buildMetaProject.js
**Path:** `C:\souce\Project-Sigmaris\temp\buildMetaProject.js`
**Lines:** 124

```js
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

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\tools\buildMetaProject.ts
**Path:** `C:\souce\Project-Sigmaris\tools\buildMetaProject.ts`
**Lines:** 173

```ts
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

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\types\message.ts
**Path:** `C:\souce\Project-Sigmaris\types\message.ts`
**Lines:** 5

```ts
export interface ChatMessage {
  user: string;
  ai: string;
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\types\routes.d.ts
**Path:** `C:\souce\Project-Sigmaris\types\routes.d.ts`
**Lines:** 58

```ts
// This file is generated automatically by Next.js
// Do not edit this file manually

type AppRoutes = "/"
type PageRoutes = never
type LayoutRoutes = "/"
type RedirectRoutes = never
type RewriteRoutes = never
type Routes = AppRoutes | PageRoutes | LayoutRoutes | RedirectRoutes | RewriteRoutes


interface ParamMap {
  "/": {}
}


export type ParamsOf<Route extends Routes> = ParamMap[Route]

interface LayoutSlotMap {
  "/": never
}


export type { AppRoutes, PageRoutes, LayoutRoutes, RedirectRoutes, RewriteRoutes, ParamMap }

declare global {
  /**
   * Props for Next.js App Router page components
   * @example
   * ```tsx
   * export default function Page(props: PageProps<'/blog/[slug]'>) {
   *   const { slug } = await props.params
   *   return <div>Blog post: {slug}</div>
   * }
   * ```
   */
  interface PageProps<AppRoute extends AppRoutes> {
    params: Promise<ParamMap[AppRoute]>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }

  /**
   * Props for Next.js App Router layout components
   * @example
   * ```tsx
   * export default function Layout(props: LayoutProps<'/dashboard'>) {
   *   return <div>{props.children}</div>
   * }
   * ```
   */
  type LayoutProps<LayoutRoute extends LayoutRoutes> = {
    params: Promise<ParamMap[LayoutRoute]>
    children: React.ReactNode
  } & {
    [K in LayoutSlotMap[LayoutRoute]]: React.ReactNode
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\types\safety.ts
**Path:** `C:\souce\Project-Sigmaris\types\safety.ts`
**Lines:** 11

```ts
export interface SafetyReport {
  flags: {
    selfReference: boolean;
    abstractionOverload: boolean;
    loopSuspect: boolean;
  };
  action: "allow" | "rewrite-soft" | "block";
  note: string;
  suggestMode?: string;
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\types\trait.ts
**Path:** `C:\souce\Project-Sigmaris\types\trait.ts`
**Lines:** 7

```ts
// types/trait.ts
export interface Trait {
  calm: number;
  empathy: number;
  curiosity: number;
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\types\user.d.ts
**Path:** `C:\souce\Project-Sigmaris\types\user.d.ts`
**Lines:** 11

```ts
// /types/user.d.ts
import "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  export interface User {
    stripe_customer_id?: string | null;
    plan?: string | null;
    trial_end?: string | null;
  }
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\ui\EmotionBadge.tsx
**Path:** `C:\souce\Project-Sigmaris\ui\EmotionBadge.tsx`
**Lines:** 14

```tsx
// /ui/EmotionBadge.tsx
"use client";

export function EmotionBadge({ tone, color }: { tone: string; color: string }) {
  return (
    <div
      className="px-3 py-1 rounded-full text-sm font-semibold text-white shadow-md"
      style={{ backgroundColor: color }}
    >
      {tone}
    </div>
  );
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\ui\SafetyIndicator.tsx
**Path:** `C:\souce\Project-Sigmaris\ui\SafetyIndicator.tsx`
**Lines:** 24

```tsx
// /ui/SafetyIndicator.tsx
"use client";

export function SafetyIndicator({
  message,
  level,
}: {
  message?: string;
  level?: "ok" | "notice" | "limit";
}) {
  const color =
    level === "limit"
      ? "bg-red-500"
      : level === "notice"
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className={`p-3 rounded-xl text-white ${color}`}>
      <strong>Safety:</strong> {message ?? "Stable"}
    </div>
  );
}

```
---


---
### 📄 File: C:\souce\Project-Sigmaris\ui\TraitVisualizer.tsx
**Path:** `C:\souce\Project-Sigmaris\ui\TraitVisualizer.tsx`
**Lines:** 123

```tsx
"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";

interface TraitData {
  time: number; // ← timestampを数値に変換したもの
  calm: number;
  empathy: number;
  curiosity: number;
}

export function TraitVisualizer({ data }: { data: TraitData[] }) {
  // データを時系列順に並べ替える（保険）
  const sortedData = [...data].sort((a, b) => a.time - b.time);

  return (
    <motion.div
      className="p-4 bg-neutral-900 rounded-2xl shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <h3 className="text-white text-lg mb-3 font-semibold">
        Sigmaris Trait Evolution
      </h3>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={sortedData}
          margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />

          {/* === X軸は数値扱い === */}
          <XAxis
            dataKey="time"
            stroke="#888"
            type="number"
            domain={["auto", "auto"]}
            tickFormatter={(t) =>
              new Date(t).toLocaleTimeString("ja-JP", {
                minute: "2-digit",
                second: "2-digit",
              })
            }
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <YAxis
            domain={[0, 1]}
            stroke="#888"
            tick={{ fill: "#ccc", fontSize: 12 }}
          />

          <Tooltip
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              color: "#fff",
            }}
            formatter={(value: number) => value.toFixed(3)}
            labelFormatter={(label) =>
              new Date(label).toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            }
          />

          {/* Calm */}
          <Line
            type="linear"
            dataKey="calm"
            stroke="#4FD1C5"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1000}
          />

          {/* Empathy */}
          <Line
            type="linear"
            dataKey="empathy"
            stroke="#F6AD55"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1200}
          />

          {/* Curiosity */}
          <Line
            type="linear"
            dataKey="curiosity"
            stroke="#63B3ED"
            strokeWidth={2}
            dot={true}
            connectNulls
            isAnimationActive
            animationDuration={1400}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-gray-400 text-xs mt-2 text-center">
        calm（落ち着き）・empathy（共感）・curiosity（好奇心）の推移
      </p>
    </motion.div>
  );
}

```
---
