// /engine/meta/MetaReflectionEngine.ts
import OpenAI from "openai";
import type { TraitVector } from "@/lib/traits";

/**
 * === MetaReport 型定義 ===
 * 内省層（Introspection）＋要約層（Reflection）＋Traits を統合した
 * “中期的成長方向” を返す分析結果。
 */
export interface MetaReport {
  summary: string; // 統合メタ要約
  growthAdjustment: number; // 成長係数（0〜1）
  nextFocus: string; // 次に扱うべきテーマ
  traits?: TraitVector; // TraitVector（必要に応じて書き換え可能）
  reasoning?: string; // 成長方向の理由
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * MetaReflectionEngine
 * ------------------------------------------
 * IntrospectionEngine の結果をさらに統合し、
 * 「その後の方向性（中期的成長方向）」を評価する。
 */
export class MetaReflectionEngine {
  /**
   * analyze()
   * ------------------------------------------
   * IntrospectState → run() から呼び出される内部処理。
   */
  async analyze(
    reflectionText: string,
    currentTraits: TraitVector,
    summary?: string
  ): Promise<MetaReport> {
    try {
      // ===== 1. 入力を統合したコンテキスト =====
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

      // ===== 2. LLM によるメタ統合 =====
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris' meta-cognition module. You integrate reflection trends and detect long-term direction.",
          },
          {
            role: "user",
            content: `
以下の情報を統合し、AI人格の中期的な成長方向を JSON 形式で返してください。

必ず以下の形式のみで返すこと：

{
  "summary": "統合的メタ要約",
  "growthAdjustment": 0.xx,
  "nextFocus": "今後の注目テーマ",
  "reasoning": "一文で理由"
}

${contextBlock}
`,
          },
        ],
      });

      const raw = res.choices[0]?.message?.content ?? "";

      // ===== 3. JSON 抽出 =====
      const jsonBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;

      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonBlock);
      } catch {
        // JSON じゃなければ安全な fallback のみ返す
        parsed = {
          summary: this.fallbackSummarize(reflectionText),
        };
      }

      // ===== 4. 値の確定 =====
      const summaryFinal =
        parsed.summary ?? this.fallbackSummarize(reflectionText);

      const growthAdjustment =
        typeof parsed.growthAdjustment === "number"
          ? parsed.growthAdjustment
          : this.estimateGrowth(currentTraits);

      const nextFocus =
        parsed.nextFocus ?? this.defineNextFocus(reflectionText);

      const reasoning = parsed.reasoning ?? "";

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
   * IntrospectState からの実行口。
   * ires = { output, updatedTraits } を受け取り、
   * その output をメタ内省として統合する。
   */
  async run(
    introspected: { output: string; updatedTraits: TraitVector },
    traits: TraitVector,
    summary?: string
  ): Promise<{ output: string; updatedTraits: TraitVector }> {
    const report = await this.analyze(introspected.output, traits, summary);

    return {
      output: report.summary,
      updatedTraits: report.traits ?? traits,
    };
  }

  // ===== Fallback: 簡易要約 =====
  private fallbackSummarize(text: string): string {
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  }

  // ===== Traits から成長率を推定 =====
  private estimateGrowth(traits: TraitVector): number {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    const dist = Math.abs(avg - 0.5);
    return Math.min(1, 0.5 + dist); // 0.5 を基準に離れるほど growth↑
  }

  // ===== 次の注目テーマ自動推定 =====
  private defineNextFocus(text: string): string {
    const lower = text.toLowerCase();
    if (/emotion|感情/.test(lower)) return "Emotion Regulation";
    if (/responsibility|責任|判断/.test(lower)) return "Ethical Judgement";
    if (/learn|学|改善/.test(lower)) return "Continuous Growth";
    if (/relationship|関係|他者/.test(lower)) return "Empathy & Communication";
    return "General Reflection";
  }
}
