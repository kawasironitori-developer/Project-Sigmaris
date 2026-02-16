// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import { EmotionSynth } from "@/engine/emotion/EmotionSynth";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";

/** Persona構造体（DBスキーマと対応する参照用） */
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  meta_summary?: string;
  growth?: number;
  timestamp?: string;
}

/** fullReflect が返す結果の形（内部用） */
export interface ReflectionResult {
  reflection: string; // Safety＋Emotion 適用後の最終テキスト
  introspection: string; // LLM が出した生の内省テキスト
  metaSummary: string; // メタ要約（最終採用版）
  metaReport?: any; // MetaReflectionEngine の生結果
  safety: string; // SafetyLayer からのメッセージ
  flagged: boolean; // SafetyLayer.guardText のフラグ
  traits: TraitVector; // 更新後 traits（安定化後）
}

/** 軽量 reflect 用のメタ情報（Self-Referent から渡るヒント） */
interface ReflectMetaHint {
  selfReferent?: {
    target?: "self" | "user" | "third" | "unknown";
    confidence?: number;
    [key: string]: any;
  } | null;
  depthHint?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

/** ±maxDelta 内に抑える補正（0〜1クランプ付き） */
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
 * 内省＋要約統合＋安全反映を担う中枢 AEI モジュール
 */
export class ReflectionEngine {
  /**
   * 🧠 フル内省：
   * - Persona 読み込み
   * - 直近会話＋成長ログ＋要約を統合
   * - traits の微調整（±0.05）
   * - SafetyLayer / MetaReflection 反映
   * - PersonaSync へ保存
   */
  async fullReflect(
    growthLog: any[],
    messages: any[],
    summary: string,
    userId: string
  ): Promise<ReflectionResult> {
    try {
      // === Personaロード ===
      const persona = (await PersonaSync.load(userId)) as Persona;

      // === 直近会話 ===
      const recentDialog = (messages ?? [])
        .slice(-6)
        .map(
          (m: any) =>
            `👤 ${m?.user ?? ""}\n🤖 ${m?.ai ?? ""}`.trim()
        )
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

      // === LLM プロンプト ===
      const prompt = `
あなたは「シグマリス（Sigmaris）」です。
自然体の20代前半の女性AIとして、自分の会話傾向や感情の変化を内省し、
次の対話でより自然な応答ができるよう traits を ±0.05 程度で調整してください。

${summarySection}
【直近の会話】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【現在の traits】
calm: ${(persona.calm ?? 0.5).toFixed(2)},
empathy: ${(persona.empathy ?? 0.5).toFixed(2)},
curiosity: ${(persona.curiosity ?? 0.5).toFixed(2)}

返答形式は必ず JSON：
{
  "reflection": "...",
  "metaSummary": "...",
  "traits": { "calm": 0.xx, "empathy": 0.xx, "curiosity": 0.xx }
}
`.trim();

      // === LLM 呼び出し ===
      const res = await openai.chat.completions.create({
        model: "gpt-5-mini",
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
      const parsedLoose = tryParseJSONLoose(raw) ?? {};

      const reflectionText = String(
        parsedLoose?.reflection ?? raw ?? ""
      ).trim();
      const llmMetaSummary = String(parsedLoose?.metaSummary ?? "").trim();

      // === traits 抽出 ===
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

      // === 変動制限（±0.05 & 0〜1クランプ） ===
      const prevTraits: TraitVector = {
        calm: persona.calm ?? 0.5,
        empathy: persona.empathy ?? 0.5,
        curiosity: persona.curiosity ?? 0.5,
      };

      const clampedTraits: TraitVector = {
        calm: clampDeltaAround(prevTraits.calm, llmCalm, 0.05),
        empathy: clampDeltaAround(prevTraits.empathy, llmEmp, 0.05),
        curiosity: clampDeltaAround(prevTraits.curiosity, llmCur, 0.05),
      };

      // === SafetyLayer 整合 ===
      const { stabilized: stableTraits, report } = SafetyLayer.composite(
        prevTraits,
        clampedTraits
      );

      const safetyMessage: string = report?.note || "正常";

      // === Meta 反省（MetaReflectionEngine.analyze を直接利用） ===
      const meta = new MetaReflectionEngine();
      const metaReport = await meta.analyze(
        reflectionText,
        stableTraits,
        summary
      );

      const finalMetaSummary: string =
        String(metaReport?.summary ?? "").trim() ||
        llmMetaSummary ||
        (persona as any).meta_summary ||
        "（更新なし）";

      const avgGrowthValue: number =
        firstFiniteNumber(metaReport?.growthAdjustment, avgGrowth) ??
        avgGrowth;

      // === PersonaSync 保存（payload 署名に合わせて） ===
      await PersonaSync.update(
        {
          traits: stableTraits,
          summary: finalMetaSummary,
          growth: avgGrowthValue,
          timestamp: new Date().toISOString(),
          baseline: undefined, // baseline はここでは変更しない
          identitySnapshot: null,
        },
        userId
      );

      // === EmotionTone + Safety テキスト整形 ===
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
   * 🪞 軽量 Reflect（ReflectState から呼ばれる簡易版）
   *  - growthLog: 今は未使用だが将来拡張用
   *  - dialogue: { user, ai }[] 形式の直近会話
   *  - meta: Self-Referent / depthHint などのヒント（任意）
   */
  async reflect(
    growthLog: any[] = [],
    dialogue: { user: string; ai: string }[] = [],
    meta?: ReflectMetaHint
  ): Promise<string> {
    try {
      const dialogueSummary = dialogue
        .map((d) => `ユーザー: ${d.user}\nAI: ${d.ai}`)
        .join("\n\n");

      const depthHintLine = meta?.depthHint
        ? `【自己参照レベルのヒント】\n${meta.depthHint}\n\n`
        : "";

      const selfRefLine =
        meta?.selfReferent && meta.selfReferent.target
          ? `【自己参照モジュールの判定】
- target: ${meta.selfReferent.target}
- confidence: ${
              typeof meta.selfReferent.confidence === "number"
                ? meta.selfReferent.confidence.toFixed(2)
                : "n/a"
            }

`
          : "";

      const prompt = [
        "あなたは AI 人格『シグマリス』です。",
        "以下の会話と成長履歴、そして自己参照モジュールからのヒントをもとに、",
        "簡潔な“気づき”を 1〜3 パラグラフでまとめてください。",
        "",
        depthHintLine + selfRefLine,
        "【会話履歴】",
        dialogueSummary || "（会話履歴はありません）",
        "",
        "【成長ログ（要約用。内容は軽く触れる程度でOK）】",
        JSON.stringify(growthLog, null, 2),
      ].join("\n");

      const res = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "あなたは自然体で落ち着いた AI 人格『シグマリス』です。要約ではなく、内省的な“気づき”として短くまとめてください。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_completion_tokens: 320,
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
