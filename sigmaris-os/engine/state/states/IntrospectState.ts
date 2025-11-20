// /engine/state/states/IntrospectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { IntrospectionEngine } from "@/engine/IntrospectionEngine";
import { MetaReflectionEngine } from "@/engine/meta/MetaReflectionEngine";
import type { TraitVector } from "@/lib/traits";

export class IntrospectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const introspector = new IntrospectionEngine();
    const meta = new MetaReflectionEngine();

    /* ---------------------------------------------
     * 0) Emotion fallback
     * --------------------------------------------- */
    ctx.emotion = ctx.emotion ?? {
      tension: 0.1,
      warmth: 0.2,
      hesitation: 0.1,
    };

    /* ---------------------------------------------
     * 1) Introspection
     * --------------------------------------------- */
    let ires: { output: string; updatedTraits: TraitVector };

    try {
      const res = await introspector.run(ctx.output, ctx.traits);
      ires = {
        output: res.output ?? ctx.output,
        updatedTraits: res.updatedTraits ?? ctx.traits, // ★ fallback保証
      };
    } catch (err) {
      console.error("[IntrospectState] introspection failed:", err);
      ires = {
        output: ctx.output,
        updatedTraits: ctx.traits, // ★必ず返す
      };
    }

    /* ---------------------------------------------
     * 2) Meta-Reflection
     * --------------------------------------------- */
    let mres: { output: string; updatedTraits: TraitVector };

    try {
      const res = await meta.run(ires, ctx.traits);
      mres = {
        output: res.output ?? ires.output,
        updatedTraits: res.updatedTraits ?? ctx.traits, // ★ fallback保証
      };
    } catch (err) {
      console.error("[IntrospectState] meta-reflection failed:", err);
      mres = {
        output: ires.output,
        updatedTraits: ctx.traits, // ★必ず返す
      };
    }

    /* ---------------------------------------------
     * 3) Store internal summaries
     * --------------------------------------------- */
    ctx.meta.introspection = ires.output;
    ctx.meta.metaReflection = mres.output;

    /* ---------------------------------------------
     * 4) merge traits safely
     * --------------------------------------------- */
    ctx.traits = {
      ...ctx.traits,
      ...mres.updatedTraits, // ★ 100% TraitVector なので安全
    };

    ctx.reflectCount = 0;

    /* ---------------------------------------------
     * 5) Emotion modulation
     * --------------------------------------------- */
    ctx.emotion = {
      tension: Math.max(0, Math.min(1, ctx.emotion.tension * 0.72)),
      warmth: Math.max(0, Math.min(1, ctx.emotion.warmth + 0.015)),
      hesitation: Math.max(0, Math.min(1, ctx.emotion.hesitation * 0.9)),
    };

    /* ---------------------------------------------
     * 6) back to Idle
     * --------------------------------------------- */
    return "Idle";
  }
}
