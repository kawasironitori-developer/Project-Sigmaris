// /engine/state/states/IntrospectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import type { TraitVector } from "@/lib/traits";

/**
 * IntrospectState v3.3（MetaReflectionEngine.run の型と完全整合）
 */
export class IntrospectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const introspector = new IntrospectionEngine();
    const meta = new MetaReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion fallback
     * --------------------------------------------- */
    ctx.emotion ??= {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) ReflectState → IntrospectState の hint
     * --------------------------------------------- */
    const reflectHint = (ctx.meta?.reflectHint ?? null) as {
      selfReferent?: {
        target?: "self" | "user" | "third" | "unknown";
        confidence?: number;
      } | null;
      depthHint?: string;
    } | null;

    let depthHint: "self" | "user" | "third" | "neutral" = "neutral";

    if (reflectHint?.selfReferent) {
      const r = reflectHint.selfReferent;
      if (r.target === "self" && r.confidence! > 0.6) depthHint = "self";
      else if (r.target === "user" && r.confidence! > 0.4) depthHint = "user";
      else if (r.target === "third") depthHint = "third";
    }

    /* ---------------------------------------------
     * 2) IntrospectionEngine（階層2）
     * --------------------------------------------- */
    const baseInput =
      (typeof ctx.meta?.reflection === "string" && ctx.meta.reflection) ||
      ctx.output ||
      ctx.input ||
      "";

    let ires: { output: string; updatedTraits: TraitVector };

    try {
      const res = await introspector.run(baseInput, ctx.traits, {
        message: ctx.input ?? "",
        reflection:
          typeof ctx.meta?.reflection === "string"
            ? ctx.meta.reflection
            : undefined,
        contextSummary:
          typeof ctx.summary === "string" ? ctx.summary : undefined,
        depth: depthHint,
      });

      ires = {
        output: res.output ?? baseInput,
        updatedTraits: res.updatedTraits ?? ctx.traits,
      };
    } catch (err) {
      console.error("[IntrospectState] introspection failed:", err);
      ires = {
        output: baseInput,
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 3) MetaReflectionEngine（階層3）
     *    run(introspected, traits, options?)
     * --------------------------------------------- */
    let mres: { output: string; updatedTraits: TraitVector };

    try {
      const summary =
        typeof ctx.meta?.reflection === "string"
          ? ctx.meta.reflection
          : undefined;

      const metaOptions = summary !== undefined ? { summary } : undefined;

      const res = await meta.run(
        {
          output: ires.output,
          updatedTraits: ires.updatedTraits,
        },
        ctx.traits,
        metaOptions // ← string ではなく { summary } に包んだ
      );

      mres = {
        output: res.output ?? ires.output,
        updatedTraits: res.updatedTraits ?? ctx.traits,
      };
    } catch (err) {
      console.error("[IntrospectState] meta-reflection failed:", err);
      mres = {
        output: ires.output,
        updatedTraits: ctx.traits,
      };
    }

    /* ---------------------------------------------
     * 4) 内部サマリー保存
     * --------------------------------------------- */
    ctx.meta.introspection = ires.output;
    ctx.meta.metaReflection = mres.output;

    /* ---------------------------------------------
     * 5) Traits 更新
     * --------------------------------------------- */
    ctx.traits = {
      calm: Number(mres.updatedTraits.calm.toFixed(4)),
      empathy: Number(mres.updatedTraits.empathy.toFixed(4)),
      curiosity: Number(mres.updatedTraits.curiosity.toFixed(4)),
    };

    ctx.reflectCount = 0;

    /* ---------------------------------------------
     * 6) Emotion 調整
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.72)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.02)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.9)),
    };

    return "Idle";
  }
}
