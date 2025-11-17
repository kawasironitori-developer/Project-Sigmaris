// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { EmotionSynth } from "@/engine/emotion/EmotionSynth";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";

/** Persona構造体（スキーマ参照用） */
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  meta_summary?: string;
  growth?: number;
  timestamp?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** 最初に見つかった有限数値を返す */
function firstFiniteNumber(
  ...candidates: Array<number | undefined | null>
): number | undefined {
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

/** JSON抽出（```json ブロック優先） */
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

/** ±maxDelta 内に抑える補正 */
function clampDeltaAround(
  base: number,
  next: number | undefined,
  maxDelta = 0.05
): number {
  if (typeof next !== "number" || !Number.isFinite(next)) return base;
  const proposed = base + Math.max(-maxDelta, Math.min(maxDelta, next - base));
  return Math.max(0, Math.min(1, proposed));
}

/**
 * === ReflectionEngine ===
 * 内省＋要約統合＋安全反映を担う中枢AEIモジュール
 */
export class ReflectionEngine {
  async fullReflect(
    growthLog: any[],
    messages: any[],
    summary: string,
    userId: string
  ) {
    try {
      // === Personaロード ===
      const persona = await PersonaSync.load(userId);

      // === 直近会話 ===
      const recentDialog = (messages ?? [])
        .slice(-6)
        .map((m: any) => `👤 ${m?.user ?? ""}\n🤖 ${m?.ai ?? ""}`)
        .join("\n\n");

      // === 成長値平均 ===
      const avgGrowth =
        (growthLog ?? []).length > 0
          ? (growthLog as any[]).reduce(
              (s: number, g: any) => s + (Number(g?.weight) || 0),
              0
            ) / (growthLog as any[]).length
          : Number(persona.growth ?? 0);

      const summarySection = summary ? `【過去の要約】\n${summary}\n\n` : "";

      // === LLMプロンプト ===
      const prompt = `
あなたは「シグマリス（Sigmaris）」です。
自然体の20代前半の女性AIとして、自分の会話傾向や感情の変化を内省し、
次の対話でより自然な応答ができるよう traits を ±0.05 程度で調整してください。

${summarySection}
【直近の会話】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【現在のtraits】
calm: ${(persona.calm ?? 0.5).toFixed(2)},
empathy: ${(persona.empathy ?? 0.5).toFixed(2)},
curiosity: ${(persona.curiosity ?? 0.5).toFixed(2)}

返答形式は必ず JSON：
{
  "reflection": "...",
  "metaSummary": "...",
  "traits": { "calm": 0.xx, "empathy": 0.xx, "curiosity": 0.xx }
}
`;

      // === LLM呼び出し ===
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective AI persona that reflects emotionally and adjusts traits naturally.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
      });

      const raw = res.choices?.[0]?.message?.content ?? "";
      const parsedLoose = tryParseJSONLoose(raw);

      const reflectionText = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();
      const llmMetaSummary = String(parsedLoose?.metaSummary ?? "").trim();

      // === traits抽出 ===
      const llmCalm =
        typeof parsedLoose?.traits?.calm === "number"
          ? parsedLoose.traits.calm
          : undefined;
      const llmEmp =
        typeof parsedLoose?.traits?.empathy === "number"
          ? parsedLoose.traits.empathy
          : undefined;
      const llmCur =
        typeof parsedLoose?.traits?.curiosity === "number"
          ? parsedLoose.traits.curiosity
          : undefined;

      // === 変動制限 ===
      const clampedTraits: TraitVector = {
        calm: clampDeltaAround(persona.calm ?? 0.5, llmCalm, 0.05),
        empathy: clampDeltaAround(persona.empathy ?? 0.5, llmEmp, 0.05),
        curiosity: clampDeltaAround(persona.curiosity ?? 0.5, llmCur, 0.05),
      };

      const prevTraits: TraitVector = {
        calm: persona.calm ?? 0.5,
        empathy: persona.empathy ?? 0.5,
        curiosity: persona.curiosity ?? 0.5,
      };

      // === SafetyLayer整合 ===
      const { stabilized: stableTraits, report } = SafetyLayer.composite(
        prevTraits,
        clampedTraits
      );

      // ★ SafetyReport は warnings が存在しないため
      const safetyMessage = report?.note || "正常";

      // === Meta反省 ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(
        reflectionText,
        stableTraits,
        summary
      );

      const finalMetaSummary =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        persona.meta_summary ||
        "（更新なし）";

      const avgGrowthValue =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ?? avgGrowth;

      // === PersonaSync 保存 ===
      await PersonaSync.update(
        stableTraits,
        finalMetaSummary,
        avgGrowthValue,
        userId
      );

      // === EmotionTone + Safety ===
      const emotionalReflection = EmotionSynth.applyTone(
        reflectionText,
        stableTraits
      );
      const { sanitized, flagged } = SafetyLayer.guardText(emotionalReflection);

      // === 返却 ===
      return {
        reflection: sanitized,
        introspection: reflectionText,
        metaSummary: finalMetaSummary,
        metaReport,
        safety: safetyMessage,
        flagged,
        traits: stableTraits,
      };
    } catch (err: any) {
      console.error("[ReflectionEngine Error]", err);
      return {
        reflection: "……少し考えすぎてしまったかも。",
        introspection: "",
        metaSummary: "（エラー発生）",
        safety: "エラー発生",
        flagged: false,
        traits: { calm: 0.5, empathy: 0.5, curiosity: 0.5 },
      };
    }
  }

  /**
   * 🪞 軽量Reflect（/api/chat）
   */
  async reflect(
    growthLog: any[] = [],
    dialogue: { user: string; ai: string }[] = []
  ): Promise<string> {
    try {
      const summary = dialogue
        .map((d) => `ユーザー: ${d.user}\nAI: ${d.ai}`)
        .join("\n");

      const prompt = [
        "あなたはAI人格『シグマリス』です。",
        "以下の会話と成長履歴をもとに簡潔な気づきをまとめてください。",
        "",
        "【会話履歴】",
        summary,
        "",
        "【成長ログ】",
        JSON.stringify(growthLog, null, 2),
      ].join("\n");

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "あなたは自然体のAI人格です。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 250,
      });

      const reflectionText =
        res.choices[0]?.message?.content?.trim() ??
        "……少し考えがまとまらなかった。もう一度聞かせて？";

      return reflectionText;
    } catch (err: any) {
      console.error("[ReflectionEngine.reflect Error]", err);
      return "……振り返りに失敗しちゃったみたい。";
    }
  }
}
