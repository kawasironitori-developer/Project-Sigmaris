import OpenAI from "openai";
import type { TraitVector } from "@/lib/traits";

/**
 * === MetaReport 型定義 ===
 * Introspection + Reflection + Traits を統合し、
 * 中期的な人格方向性を示す。
 */
export interface MetaReport {
  summary: string;
  growthAdjustment: number;
  nextFocus: string;
  traits?: TraitVector;
  reasoning?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * MetaReflectionEngine
 * ------------------------------------------
 * IntrospectionEngine → Meta-Layer（中期方向性）
 */
export class MetaReflectionEngine {
  /**
   * analyze()
   * ------------------------------------------
   * LLM によるメタ統合処理（純粋関数）
   */
  async analyze(
    reflectionText: string,
    currentTraits: TraitVector,
    summary?: string
  ): Promise<MetaReport> {
    try {
      /* ---------------------------------------
       * 1) 入力統合
       * ------------------------------------- */
      const contextBlock = [
        summary ? `【過去要約】\n${summary}` : "",
        `【現在の内省】\n${reflectionText}`,
        `【Traits】 calm=${currentTraits.calm.toFixed(
          2
        )}, empathy=${currentTraits.empathy.toFixed(
          2
        )}, curiosity=${currentTraits.curiosity.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      /* ---------------------------------------
       * 2) LLM 呼び出し
       * ------------------------------------- */
      const res = await openai.chat.completions.create({
        model: "gpt-5-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris' meta-cognition module. Integrate reflection trends and detect long-term direction.",
          },
          {
            role: "user",
            content: `
以下の情報を統合し、AI人格の中期的成長方向を **必ず JSON 形式で** 返してください。

返答フォーマット：
{
  "summary": "統合メタ要約",
  "growthAdjustment": 0.xx,
  "nextFocus": "今後の注目テーマ",
  "reasoning": "短い理由"
}

${contextBlock}
`,
          },
        ],
      });

      const raw = res.choices?.[0]?.message?.content ?? "";

      /* ---------------------------------------
       * 3) JSON 抽出（```json ブロック優先）
       * ------------------------------------- */
      const jsonBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;

      let parsed: any = null;

      try {
        parsed = JSON.parse(jsonBlock);
      } catch (_) {
        parsed = null;
      }

      /* ---------------------------------------
       * 4) Fallback 安全処理
       * ------------------------------------- */
      const summaryFinal =
        parsed?.summary ?? this.fallbackSummarize(reflectionText);

      const growthAdjustment =
        typeof parsed?.growthAdjustment === "number"
          ? parsed.growthAdjustment
          : this.estimateGrowth(currentTraits);

      const nextFocus =
        parsed?.nextFocus ?? this.defineNextFocus(reflectionText);

      const reasoning =
        typeof parsed?.reasoning === "string" ? parsed.reasoning : "";

      return {
        summary: summaryFinal,
        growthAdjustment,
        nextFocus,
        traits: currentTraits,
        reasoning,
      };
    } catch (err) {
      console.error("[MetaReflectionEngine.analyze Error]", err);

      return {
        summary: "（メタ内省を統合できませんでした）",
        growthAdjustment: 0,
        nextFocus: "Stability Maintenance",
        traits: currentTraits,
      };
    }
  }

  /**
   * run()
   * ------------------------------------------
   * IntrospectState → MetaReflectionEngine の正式入口。
   * options.summary のみ利用（selfReferent 等は今後拡張用）
   */
  async run(
    introspected: { output: string; updatedTraits: TraitVector },
    traits: TraitVector,
    options?: {
      selfReferent?: any;
      depth?: string;
      reflectCount?: number;
      summary?: string;
    }
  ): Promise<{ output: string; updatedTraits: TraitVector }> {
    const summary = options?.summary;

    const report = await this.analyze(introspected.output, traits, summary);

    return {
      output: report.summary,
      updatedTraits: report.traits ?? traits,
    };
  }

  /* ------------------------------------------
   * fallback 簡易要約
   * ---------------------------------------- */
  private fallbackSummarize(text: string): string {
    return text.length > 120 ? text.slice(0, 120) + "…" : text;
  }

  /* ------------------------------------------
   * traits → growth 推定
   * ---------------------------------------- */
  private estimateGrowth(traits: TraitVector): number {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    const dist = Math.abs(avg - 0.5);
    // 0.5（基準）からの距離で成長度を推定
    return Math.min(1, 0.5 + dist);
  }

  /* ------------------------------------------
   * 次の注目テーマを決定
   * ---------------------------------------- */
  private defineNextFocus(text: string): string {
    const lower = text.toLowerCase();

    if (/emotion|感情/.test(lower)) return "Emotion Regulation";
    if (/responsibility|責任|判断/.test(lower)) return "Ethical Judgment";
    if (/learn|学|改善/.test(lower)) return "Continuous Growth";
    if (/relationship|関係|他者/.test(lower)) return "Empathy & Communication";

    return "General Reflection";
  }
}
