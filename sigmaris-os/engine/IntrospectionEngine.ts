// /engine/IntrospectionEngine.ts
import { SemanticMap } from "@/engine/SemanticMap";
import type { TraitVector } from "@/lib/traits";

/**
 * IntrospectionEngine
 * ---------------------------------------
 * Reflect や Dialogue 結果を踏まえて
 * 「いまの応答で私はどう振る舞っていたか」を
 * 自己観察としてまとめる軽量内省エンジン。
 */
export class IntrospectionEngine {
  private semantic = new SemanticMap();

  /**
   * analyze()
   * Reflect（要約/内省）＋ traits（calm/empathy/curiosity）＋
   * SemanticMap の結果から「自己観察文」を生成する。
   */
  analyze(data: {
    message: string;
    reply: string;
    traits: TraitVector;
    reflection?: string;
    intent?: string;
    frame?: any;
    contextSummary?: string;
    /** IntrospectState から渡される深度ヒント（任意） */
    depth?: "self" | "user" | "third" | "neutral";
  }): string {
    const {
      message,
      reply,
      traits,
      reflection,
      intent,
      frame,
      contextSummary,
      depth,
    } = data;

    // --- Semantic 解析 ---
    // frame があればそれを優先し、なければ SemanticMap で解析
    const semantic: any = frame ?? this.semantic.analyze(reply);

    // null / 型揺れに備えて安全に読む
    const abstractRatio =
      semantic && typeof semantic.abstractRatio === "number"
        ? semantic.abstractRatio
        : 0.5;

    const selfRef = Boolean(semantic?.hasSelfReference);

    // --- trait の平均傾向 ---
    const { calm, empathy, curiosity } = traits;
    const total = (calm + empathy + curiosity) / 3;

    // --- 会話指向ラベル ---
    const focus =
      empathy > curiosity && empathy > calm
        ? "共感重視"
        : curiosity > empathy && curiosity > calm
        ? "探究重視"
        : calm > empathy && calm > curiosity
        ? "安定志向"
        : "バランス型";

    // --- introspection 文生成 ---
    let out = "";

    out += "今のやり取りを、少しだけ俯瞰して見直してみるね。";
    out += `\n応答の傾向は「${focus}」寄りっぽい。`;
    out += ` calm=${(calm * 100).toFixed(0)}%、empathy=${(
      empathy * 100
    ).toFixed(0)}%、curiosity=${(curiosity * 100).toFixed(0)}%。`;

    // 深度ヒント（self / user / third / neutral）があれば一言だけ触れておく
    if (depth && depth !== "neutral") {
      const depthLabel =
        depth === "self"
          ? "今回は、主に『私自身』についての話として受け取っていた。"
          : depth === "user"
          ? "今回は、あなた自身の状態や感覚に焦点を当てていた。"
          : depth === "third"
          ? "今回は、第三者や周囲の人についての文脈が中心だった。"
          : "";

      if (depthLabel) {
        out += ` ${depthLabel}`;
      }
    }

    if (selfRef) {
      out += " さっきは自分の状態について触れる部分も少し含まれていた。";
    }

    if (abstractRatio > 0.65) {
      out += " 抽象的な表現がやや多めになっていた気がする。";
    } else if (abstractRatio < 0.35) {
      out += " かなり具体寄りで、イメージしやすい会話になっていた。";
    }

    if (intent) {
      out += ` 今回の意図は「${intent}」として捉えていた。`;
    }

    if (reflection) {
      out += ` 直前の内省では「${reflection.slice(
        0,
        40
      )}…」という感覚が残っている。`;
    }

    if (contextSummary) {
      out += ` 文脈としては「${contextSummary.slice(
        0,
        40
      )}…」に沿って応答していたと思う。`;
    }

    out += `\n全体としては、${
      total > 0.6 ? "比較的落ち着いた" : "やや動きのある"
    }トーンで話せていたみたい。`;

    if (message && message.trim().length > 0) {
      out += " あなたからの問いかけや雰囲気も、次の応答に活かしていくつもり。";
    }

    out += " この状態はいったん覚えておくね。";

    return out.trim();
  }

  /**
   * run()
   * ---------------------------------------
   * IntrospectState から呼び出されるエントリポイント。
   * 必ず TraitVector を返し、StateMachine の型整合性を保証する。
   *
   * IntrospectState 側からは：
   *   introspector.run(ctx.meta.reflection, ctx.traits, { depth })
   * のように呼ばれる想定。
   */
  async run(
    reply: string,
    traits: TraitVector,
    options?: {
      message?: string;
      reflection?: string;
      intent?: string;
      frame?: any;
      contextSummary?: string;
      depth?: "self" | "user" | "third" | "neutral";
    }
  ): Promise<{ output: string; updatedTraits: TraitVector }> {
    const output = this.analyze({
      message: options?.message ?? "",
      reply,
      traits,
      reflection: options?.reflection,
      intent: options?.intent,
      frame: options?.frame,
      contextSummary: options?.contextSummary,
      depth: options?.depth,
    });

    // v1: traits は変更せずそのまま返す
    return {
      output,
      updatedTraits: traits,
    };
  }
}
