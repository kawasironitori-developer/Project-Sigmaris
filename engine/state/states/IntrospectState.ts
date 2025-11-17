// /engine/state/states/IntrospectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";

export class IntrospectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const introspector = new IntrospectionEngine();
    const meta = new MetaReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion フォールバック
     * --------------------------------------------- */
    if (!ctx.emotion) {
      ctx.emotion = {
        tension: 0.1,
        warmth: 0.2,
        hesitation: 0.1,
      };
    }

    /* ---------------------------------------------
     * 1) Introspection（短期内省）
     * --------------------------------------------- */
    let ires: any = null;

    try {
      ires = await introspector.run(ctx.output, ctx.traits);
    } catch (err) {
      console.error("IntrospectState: introspection failed:", err);
      // フォールバック
      ires = {
        output: ctx.output,
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 2) Meta-Reflection（中期メタ内省）
     * --------------------------------------------- */
    let mres: any = null;

    try {
      mres = await meta.run(ires, ctx.traits);
    } catch (err) {
      console.error("IntrospectState: meta-reflection failed:", err);
      mres = {
        output: ires.output ?? ctx.output,
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 3) 出力は “内部保存” のみに使う（ユーザーには返さない）
     * --------------------------------------------- */
    ctx.meta.introspectSummary = ires.output ?? "";
    ctx.meta.metaSummary = mres.output ?? "";

    // Traits は部分更新を merge
    ctx.traits = {
      ...ctx.traits,
      ...(mres.updatedTraits ?? {}),
    };

    // Reflect の連続カウントをリセット
    ctx.reflectCount = 0;

    /* ---------------------------------------------
     * 4) Emotion の微調整（内省の余韻）
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.7)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.03)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.85)),
    };

    /* ---------------------------------------------
     * 5) 1サイクル終了 → Idle に戻す
     * --------------------------------------------- */
    return "Idle";
  }
}
