// /engine/state/states/ReflectState.ts
import { StateContext, SigmarisState } from "../StateContext";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

export class ReflectState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    const engine = new ReflectionEngine();

    // 🧠 軽量 Reflect:
    // - growthLog は今は未使用なので []
    // - 直前の対話 1ペアだけを渡す
    const summary = await engine.reflect(
      [],
      [
        {
          user: ctx.input,
          ai: ctx.output,
        },
      ]
    );

    // ReflectState の責務：ctx.output に「内省／要約」を入れる
    ctx.output = summary;
    ctx.reflectCount++;

    // 次は IntrospectState に渡す
    return "Introspect";
  }
}
