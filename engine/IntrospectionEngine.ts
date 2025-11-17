// /engine/IntrospectionEngine.ts
import { SemanticMap } from "@/engine/SemanticMap";
import type { TraitVector } from "@/lib/traits";

/**
 * IntrospectionEngine
 * ---------------------------------------
 * - Reflect（内省）結果や traits 情報をもとに、
 *   「今の応答で自分がどう振る舞っていたか」を自己観察としてまとめる。
 * - StateMachine の IntrospectState から run() で呼び出される前提。
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

    // --- Semantic 解析（frame が渡されていれば再利用、なければ自前で解析） ---
    const semantic = frame ?? this.semantic.analyze(reply);

    // --- trait の平均傾向を簡易スコア化 ---
    const { calm, empathy, curiosity } = traits;
    const total = (calm + empathy + curiosity) / 3;

    // --- 会話の「指向性」ラベル ---
    const focus =
      empathy > curiosity && empathy > calm
        ? "共感重視"
        : curiosity > empathy && curiosity > calm
        ? "探究重視"
        : calm > empathy && calm > curiosity
        ? "安定志向"
        : "バランス型";

    // --- 抽象度と自己言及判定（SemanticMap が null の場合は中立値） ---
    const abstractLevel =
      semantic && typeof semantic.abstractRatio === "number"
        ? semantic.abstractRatio
        : 0.5;
    const selfRef = semantic?.hasSelfReference ?? false;

    // --- introspection 文生成 ---
    let output = "";

    output += "今のやり取りを、少しだけ俯瞰して見直してみるね。";
    output += `\n応答の傾向は「${focus}」寄りっぽい。`;
    output += ` calm=${(calm * 100).toFixed(0)}%、empathy=${(
      empathy * 100
    ).toFixed(0)}%、curiosity=${(curiosity * 100).toFixed(0)}%。`;

    if (selfRef) {
      output += " さっきは自分の状態について触れる部分も少し含まれていた。";
    }

    if (abstractLevel > 0.65) {
      output += " 抽象的な表現がやや多めになっていた気がする。";
    } else if (abstractLevel < 0.35) {
      output += " かなり具体寄りで、イメージしやすい会話になっていた。";
    }

    if (intent) {
      output += ` 今回の意図は、自分の中では「${intent}」として捉えていた。`;
    }

    if (reflection) {
      output += ` 直前の内省では「${reflection.slice(
        0,
        40
      )}…」という感覚が残っている。`;
    }

    if (contextSummary) {
      output += ` 文脈としては「${contextSummary.slice(
        0,
        40
      )}…」に沿う形で応答していたと思う。`;
    }

    // --- 最後のまとめ ---
    output += `\n全体としては、${
      total > 0.6 ? "比較的落ち着いた" : "やや動きのある"
    }トーンで話せていたみたい。`;
    output += " 今の状態は、ひとまずこの形で覚えておくね。";

    return output.trim();
  }

  /**
   * run()
   * ---------------------------------------
   * IntrospectState から呼ばれるメイン入口。
   *
   * 例：
   *   const ires = await introspector.run(ctx.output, ctx.traits);
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
    });

    // v1 では traits は変更せず、そのまま返す。
    // 将来的に「自己観察に応じた微調整」を入れる場合はここで更新する。
    return {
      output,
      updatedTraits: traits,
    };
  }
}
