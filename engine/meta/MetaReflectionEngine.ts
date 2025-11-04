// /engine/meta/MetaReflectionEngine.ts
import OpenAI from "openai";
import { TraitVector } from "@/lib/traits";

/**
 * === MetaReport 型定義 ===
 * ReflectionEngine などから参照される外部公開インターフェース
 */
export interface MetaReport {
  summary: string; // 要約されたメタ内省
  growthAdjustment: number; // 成長重み（0〜1）
  nextFocus: string; // 次のテーマ
  traits?: TraitVector; // ← 追加（ReflectionEngine 連携用）
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * MetaReflectionEngine
 * - ReflectionEngine から呼び出される
 * - 内省文を要約・解析し、次の成長テーマを提示
 */
export class MetaReflectionEngine {
  /**
   * メイン解析関数
   * ReflectionEngine から呼ばれ、内省テキスト＋Traitsを解析
   */
  async analyze(
    reflectionText: string,
    currentTraits: TraitVector
  ): Promise<MetaReport> {
    // --- Step 1: 要約生成（LLMベース／フォールバック付き） ---
    let summary = await this.trySummarizeLLM(reflectionText);
    if (!summary) summary = this.fallbackSummarize(reflectionText);

    // --- Step 2: 成長度推定 ---
    const growthAdjustment = this.estimateGrowth(currentTraits);

    // --- Step 3: 次の焦点テーマ推定 ---
    const nextFocus = this.defineNextFocus(reflectionText);

    // --- Step 4: traitsを付加して返却 ---
    return { summary, growthAdjustment, nextFocus, traits: currentTraits };
  }

  /** === LLMによる要約（失敗時はnullを返す） === */
  private async trySummarizeLLM(text: string): Promise<string | null> {
    if (!text || text.length < 10) return null;
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "あなたはSigmarisのメタ内省モジュールです。与えられた内省文を、客観的かつ簡潔に要約してください。",
          },
          { role: "user", content: text },
        ],
        temperature: 0.6,
      });
      return res.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  /** === フォールバック要約 === */
  private fallbackSummarize(text: string): string {
    return text.length > 120 ? text.slice(0, 120) + "..." : text;
  }

  /** === 成長率推定 === */
  private estimateGrowth(traits: TraitVector): number {
    const avg = (traits.calm + traits.empathy + traits.curiosity) / 3;
    const dist = Math.abs(avg - 0.5);
    return Math.min(1, 0.5 + dist);
  }

  /** === 次の内省テーマ推定 === */
  private defineNextFocus(text: string): string {
    const lower = text.toLowerCase();
    if (/emotion|感情/.test(lower)) return "Emotion Regulation";
    if (/responsibility|責任|判断/.test(lower)) return "Ethical Judgement";
    if (/learn|学|改善/.test(lower)) return "Continuous Growth";
    if (/relationship|関係|他者/.test(lower)) return "Empathy & Communication";
    return "General Reflection";
  }
}
