// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { loadPersona, savePersona } from "@/lib/db";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { EmotionSynth } from "@/engine/emotion/EmotionSynth";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";

// ===== 型定義 =====
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  meta_summary?: string; // ✅ 修正: DB構造に合わせてスネークケース
  growth?: number;
  timestamp?: string;
}

type PersonaSavePayload = {
  calm: number;
  empathy: number;
  curiosity: number;
  reflectionText: string;
  metaSummary: string;
  growthWeight: number;
};

type TraitVector = Pick<Persona, "calm" | "empathy" | "curiosity">;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== Utility =====
function firstFiniteNumber(
  ...candidates: Array<number | undefined | null>
): number | undefined {
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function tryParseJSONLoose(text: string): any | null {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = block ?? text;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  const raw = objMatch ? objMatch[0] : candidate;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ===== Main Class =====
export class ReflectionEngine {
  async fullReflect(growthLog: any[], messages: any[], history: string[]) {
    // === Personaロード ===
    const persona = PersonaSync.load();

    const recentDialog = (messages ?? [])
      .slice(-6)
      .map((m: any) => `👤 ${m?.user ?? ""}\n🤖 ${m?.ai ?? ""}`)
      .join("\n\n");

    const avgGrowth =
      (growthLog ?? []).length > 0
        ? (growthLog as any[]).reduce(
            (s: number, g: any) => s + (Number(g?.weight) || 0),
            0
          ) / (growthLog as any[]).length
        : persona.growth ?? 0; // ✅ 修正済み

    const lastIntrospection =
      (history ?? []).slice(-1)[0] || "（前回の内省なし）";

    const prompt = `
あなたは「シグマリス（Sigmaris）」です。
以下の会話履歴・成長情報・内省履歴をもとに、自分の状態を振り返ってください。

---
【会話履歴】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【前回の内省】
${lastIntrospection}

【現在traits】
calm: ${persona.calm.toFixed(2)}, empathy: ${persona.empathy.toFixed(
      2
    )}, curiosity: ${persona.curiosity.toFixed(2)}
---

以下の形式で返答してください：
{
  "reflection": "自分の状態を内省した文",
  "metaSummary": "自分の成長や感情傾向のまとめ",
  "traits": { "calm": 0.xx, "empathy": 0.xx, "curiosity": 0.xx }
}
`;

    try {
      // === Reflection ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective AI persona that reflects on its dialogue and updates its personality traits.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const raw = res.choices?.[0]?.message?.content ?? "";
      const parsedLoose = tryParseJSONLoose(raw);

      const reflectionText: string = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();
      const llmMetaSummary: string = String(
        parsedLoose?.metaSummary ?? ""
      ).trim();

      const nextTraits: TraitVector = {
        calm: firstFiniteNumber(parsedLoose?.traits?.calm, persona.calm) ?? 0.5,
        empathy:
          firstFiniteNumber(parsedLoose?.traits?.empathy, persona.empathy) ??
          0.5,
        curiosity:
          firstFiniteNumber(
            parsedLoose?.traits?.curiosity,
            persona.curiosity
          ) ?? 0.5,
      };

      // === SafetyLayer Advanced ===
      const prevTraits: TraitVector = {
        calm: persona.calm,
        empathy: persona.empathy,
        curiosity: persona.curiosity,
      };
      const { stabilized: stableTraits, report } = SafetyLayer.composite(
        prevTraits,
        nextTraits
      );
      const safetyMessage = report.warnings[0] ?? null;

      // === MetaReflection ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(reflectionText, stableTraits);

      // ✅ 修正: metaSummary → meta_summary
      const finalMetaSummary =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        (persona.meta_summary ?? "（更新なし）");

      const finalGrowthWeight =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ?? avgGrowth;

      // === PersonaSync更新 ===
      PersonaSync.update(stableTraits, finalMetaSummary, finalGrowthWeight);

      // === EmotionSynthesis適用 ===
      const emotionalReflection = EmotionSynth.applyTone(
        reflectionText,
        stableTraits
      );

      // === Text Guard（伏字処理） ===
      const { sanitized, flagged } = SafetyLayer.guardText(emotionalReflection);

      // === savePersona ===
      const payload: PersonaSavePayload = {
        calm: stableTraits.calm,
        empathy: stableTraits.empathy,
        curiosity: stableTraits.curiosity,
        reflectionText: sanitized,
        metaSummary: finalMetaSummary,
        growthWeight: finalGrowthWeight,
      };
      savePersona(payload);

      // === 出力 ===
      return {
        reflection: sanitized,
        introspection: reflectionText,
        metaSummary: finalMetaSummary,
        metaReport,
        safety: safetyMessage ?? "正常",
        flagged,
      };
    } catch (err: any) {
      console.error("[ReflectionEngine Error]", err);
      return {
        reflection: "……少し考えすぎてしまったかも。",
        introspection: "",
        metaSummary: "（エラー発生）",
        safety: "エラー発生",
        flagged: false,
      };
    }
  }
}
