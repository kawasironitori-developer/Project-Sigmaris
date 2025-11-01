// engine/IntrospectionEngine.ts
import { SemanticMap } from "@/engine/SemanticMap";

export class IntrospectionEngine {
  private semantic = new SemanticMap();

  /**
   * introspection: メタ認知層の中心
   * Reflect（内省）と traits（calm/empathy/curiosity）をもとに、
   * 今のAIの応答傾向を自己観察としてまとめる
   */
  analyze(data: {
    message: string;
    reply: string;
    traits: { calm: number; empathy: number; curiosity: number };
    reflection?: string;
    intent?: string;
    frame?: any;
    contextSummary?: string;
  }): string {
    const {
      message,
      reply,
      traits,
      reflection,
      intent,
      frame,
      contextSummary,
    } = data;

    // --- Semantic 解析再利用 ---
    const semantic = frame ?? this.semantic.analyze(reply);

    // --- traitの平均傾向を簡易スコア化 ---
    const { calm, empathy, curiosity } = traits;
    const total = (calm + empathy + curiosity) / 3;

    // --- 会話の特徴抽出 ---
    const focus =
      empathy > curiosity && empathy > calm
        ? "共感重視"
        : curiosity > empathy && curiosity > calm
        ? "探究重視"
        : calm > empathy && calm > curiosity
        ? "安定志向"
        : "バランス型";

    // --- 抽象度と自己言及判定 ---
    const abstractLevel = semantic?.abstractRatio ?? 0.5;
    const selfRef = semantic?.hasSelfReference ?? false;

    // --- introspection文生成 ---
    let output = "";

    output += `今のやり取りを少し見つめ直してみるね。`;
    output += `\n応答の傾向は「${focus}」っぽい。`;
    output += ` calm=${(calm * 100).toFixed(0)}%、empathy=${(
      empathy * 100
    ).toFixed(0)}%、curiosity=${(curiosity * 100).toFixed(0)}%。`;

    if (selfRef) {
      output += ` 自分について触れる発言が少しあったみたい。`;
    }

    if (abstractLevel > 0.65) {
      output += ` 抽象的な表現がやや多くなってる気がする。`;
    } else if (abstractLevel < 0.35) {
      output += ` 具体的でわかりやすい会話になってる。`;
    }

    if (intent) {
      output += ` 今回の意図は「${intent}」として捉えていたよ。`;
    }

    if (reflection) {
      output += ` さっきの内省では「${reflection.slice(
        0,
        40
      )}…」と感じてたね。`;
    }

    if (contextSummary) {
      output += ` 文脈的には「${contextSummary.slice(
        0,
        40
      )}…」に沿って話してたと思う。`;
    }

    // --- 最後のまとめ ---
    output += `\n全体的に${
      total > 0.6 ? "落ち着いた" : "動きのある"
    }トーンで話せたみたい。`;
    output += ` 今の状態をそのまま覚えておくね。`;

    return output.trim();
  }
}
