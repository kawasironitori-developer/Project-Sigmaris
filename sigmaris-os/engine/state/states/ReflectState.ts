// /engine/state/states/ReflectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

/**
 * ReflectState v2.5（ReflectionEngine 2-args に完全整合）
 * --------------------------------------------------------
 * ・metaInfo は ctx.meta.reflectHint に格納して IntrospectState に渡す
 * ・ReflectionEngine.reflect() は 2 引数仕様のまま扱う
 */
export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion fallback（安全）
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) Self-Referent に応じた Reflect 深度調整ヒント
     *    → ReflectionEngine には渡さず、ctx.meta に保存して後段が読む
     * --------------------------------------------- */
    let depthHint = "";

    if (ctx.self_ref) {
      const ref = ctx.self_ref;

      if (ref.target === "self" && ref.confidence > 0.6) {
        depthHint =
          "ユーザーは今回、あなた（シグちゃん）本人について問うている。";
      } else if (ref.target === "user") {
        depthHint = "この発話はユーザー自身の状態に焦点がある。";
      } else if (ref.target === "third") {
        depthHint = "第三者についての発話が中心。";
      } else {
        depthHint = "発話対象は特定できない。";
      }
    }

    // IntrospectState で利用するためにメタ付加
    ctx.meta.reflectHint = {
      selfReferent: ctx.self_ref ?? null,
      depthHint,
    };

    /* ---------------------------------------------
     * 2) ReflectionEngine 用の会話ブロック構成
     * --------------------------------------------- */
    const historyBlock: { user: string; ai: string }[] = [
      {
        user: ctx.input,
        ai: ctx.output, // DialogueState の返答
      },
    ];

    /* ---------------------------------------------
     * 3) ReflectionEngine 実行
     *    ※ reflect() は 2 引数のまま
     * --------------------------------------------- */
    let summary = "";

    try {
      summary = await engine.reflect([], historyBlock);
    } catch (err) {
      console.error("[ReflectState] ReflectionEngine error:", err);
      summary = "（内省処理に失敗したため、簡易要約を返します）";
    }

    /* ---------------------------------------------
     * 4) Reflect の結果は ctx.output ではなく meta に保存
     * --------------------------------------------- */
    ctx.meta.reflection = summary;
    ctx.reflectCount++;

    /* ---------------------------------------------
     * 5) Emotion の落ち着き補正
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.82)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.015)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.88)),
    };

    /* ---------------------------------------------
     * 6) 次は Introspect（仕様固定）
     * --------------------------------------------- */
    return "Introspect";
  }
}
