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
 * Sigmaris OS — StateMachine v6（B-Spec 完全対応）
 * -------------------------------------------------------
 * ● summary / recent / traits / safety を流しながら処理
 * ● Python /sync と Next.js PersonaSync の両方と整合
 * ● 過負荷・安全性は SafetyLayer（単一責務）
 * ● State クラスは execute(ctx): Promise<SigmarisState | null>
 */
export class StateMachine {
  ctx: StateContext;

  constructor(ctx: StateContext) {
    this.ctx = ctx;
  }

  /** State のインスタンス返却 */
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

  /** B仕様用：許可遷移テーブル */
  private transitionMap: Record<SigmarisState, SigmarisState[]> = {
    Idle: ["Dialogue"],
    Dialogue: ["Reflect"],
    Reflect: ["Introspect"],
    Introspect: ["Idle"],
    OverloadPrevent: ["Dialogue", "OverloadPrevent"],
    SafetyMode: ["Idle"],
  };

  /**
   * === run(): return StateContext ===
   * 会話 → Reflect → Introspect → Idle
   */
  async run(): Promise<StateContext> {
    console.log("🟦 [StateMachine] run() start");

    // -------------------------------------------------
    // 0) 過負荷チェック（traitsに依存）
    // -------------------------------------------------
    const overloadNote = SafetyLayer.checkOverload(this.ctx.traits);

    if (overloadNote) {
      console.log("⚠️ Overload detected → OverloadPrevent");
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = "OverloadPrevent";

      this.ctx.safety = {
        flags: {
          abstractionOverload: true,
          selfReference: false,
          loopSuspect: false,
        },
        action: "rewrite-soft",
        note: overloadNote,
      };
    }

    // -------------------------------------------------
    // 1) 内部ループ（最大6ステップ）
    // -------------------------------------------------
    for (let i = 0; i < 6; i++) {
      console.log(`🔷 Step ${i}: ${this.ctx.currentState}`);

      const handler = this.getStateHandler(this.ctx.currentState);

      /** execute(ctx) → 次の State */
      let next: SigmarisState | null = null;
      try {
        next = await handler.execute(this.ctx);
      } catch (err) {
        console.error("❌ State execution error:", err);
        break;
      }

      const allowed = this.transitionMap[this.ctx.currentState] ?? [];
      console.log("➡ Allowed:", allowed, "Next:", next);

      // --- 不正遷移 ---
      if (!next || !allowed.includes(next)) {
        console.log("⏹ Invalid transition — stopping loop.");
        break;
      }

      // 遷移
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = next;

      // Idle に戻ったら終了
      if (next === "Idle") {
        console.log("🟩 Returned to Idle — end of cycle.");
        break;
      }
    }

    // -------------------------------------------------
    // 2) SafetyLayer で traits を最終安定化
    // -------------------------------------------------
    this.ctx.traits = SafetyLayer.stabilize(this.ctx.traits);

    // -------------------------------------------------
    // 3) summary / recent の B仕様準拠フォーマット
    // -------------------------------------------------
    if (this.ctx.summary === undefined) this.ctx.summary = null;
    if (this.ctx.recent === undefined) this.ctx.recent = null;

    console.log("🟩 [StateMachine] run() end");
    return this.ctx;
  }
}
