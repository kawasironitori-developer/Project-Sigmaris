// /engine/state/StateMachine.ts
import { StateContext, SigmarisState } from "./StateContext";
import { SafetyLayer } from "@/engine/safety/SafetyLayer";

// 各 State
import { IdleState } from "./states/IdleState";
import { DialogueState } from "./states/DialogueState";
import { ReflectState } from "./states/ReflectState";
import { IntrospectState } from "./states/IntrospectState";
import { OverloadPreventState } from "./states/OverloadPreventState";
import { SafetyModeState } from "./states/SafetyModeState";

/**
 * Sigmaris OS — StateMachine v5
 * ---------------------------------------
 * ・内部 3〜6ステップの思考ループ
 * ・安全性 / 過負荷チェックは SafetyLayer に一本化
 * ・State による明示的遷移を尊重
 */
export class StateMachine {
  ctx: StateContext;

  constructor(ctx: StateContext) {
    this.ctx = ctx;
  }

  /** 利用可能な State クラスを返す */
  private getStateHandler(state: SigmarisState) {
    switch (state) {
      case "Idle":
        return new IdleState();
      case "Dialogue":
        return new DialogueState();
      case "Reflect":
        return new ReflectState();
      case "Introspect":
        return new IntrospectState();
      case "OverloadPrevent":
        return new OverloadPreventState();
      case "SafetyMode":
        return new SafetyModeState();
      default:
        return new IdleState();
    }
  }

  /** 許可遷移テーブル（v5） */
  private transitionMap: Record<SigmarisState, SigmarisState[]> = {
    Idle: ["Dialogue"],
    Dialogue: ["Reflect"],
    Reflect: ["Introspect"],
    Introspect: ["Idle"],
    OverloadPrevent: ["Dialogue", "OverloadPrevent"],
    SafetyMode: ["Idle"],
  };

  /**
   * === StateMachine: run() ===
   * 内部ループ → 1 会話分の処理を統合
   */
  async run(): Promise<StateContext> {
    console.log("🟦 [StateMachine] run() start");

    // -------------------------------------------------
    // 0) SafetyLayer による 過負荷チェック
    // -------------------------------------------------
    const overloadWarning = SafetyLayer.checkOverload(this.ctx.traits);

    if (overloadWarning) {
      console.log("⚠️ Overload detected → OverloadPrevent");
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = "OverloadPrevent";
    }

    // -------------------------------------------------
    // 1) 内部ステップループ（最大 6 回）
    // -------------------------------------------------
    for (let step = 0; step < 6; step++) {
      console.log(`🔷 Step ${step} — Current: ${this.ctx.currentState}`);

      const handler = this.getStateHandler(this.ctx.currentState);

      let next: SigmarisState | null = null;
      try {
        next = await handler.execute(this.ctx);
      } catch (err) {
        console.error("❌ State execution error:", err);
        break;
      }

      const allowed = this.transitionMap[this.ctx.currentState] ?? [];
      console.log("➡️ Allowed:", allowed, "/ Next:", next);

      // 不正遷移 → 強制停止
      if (!next || !allowed.includes(next)) {
        console.log("⏹️ Invalid transition — Ending internal cycle.");
        break;
      }

      // 遷移
      console.log(`🔄 ${this.ctx.currentState} → ${next}`);
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = next;

      // Idle に戻ったら終了
      if (next === "Idle") {
        console.log("🟩 Reached Idle — internal processing end.");
        break;
      }
    }

    console.log("🟩 [StateMachine] run() end");
    return this.ctx;
  }
}
