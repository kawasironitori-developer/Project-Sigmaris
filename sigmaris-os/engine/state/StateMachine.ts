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
 * Sigmaris OS — StateMachine v7.2
 * ---------------------------------------------------------------
 * ● Self-Referent / summary / recent / python / identitySnapshot に完全対応
 * ● SafetyLayer（過負荷/構造揺れ）を最初と最後で適用
 * ● 全ステート execute(ctx) → 次のステート or null
 * ● 遷移は transitionMap によって厳密に管理
 */
export class StateMachine {
  ctx: StateContext;

  constructor(ctx: StateContext) {
    this.ctx = ctx;
  }

  /** ---------------------------------------------
   * 現在の State に対応する handler インスタンス
   * --------------------------------------------- */
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

  /** ---------------------------------------------
   * B仕様：許可遷移テーブル（厳密管理）
   * --------------------------------------------- */
  private transitionMap: Record<SigmarisState, SigmarisState[]> = {
    Idle: ["Dialogue"],
    Dialogue: ["Reflect", "SafetyMode"],
    Reflect: ["Introspect"],
    Introspect: ["Idle"],
    OverloadPrevent: ["Dialogue", "OverloadPrevent"],
    SafetyMode: ["Idle"],
  };

  /** ---------------------------------------------
   * メインループ実行（最大 6 ステップ）
   * --------------------------------------------- */
  async run(): Promise<StateContext> {
    console.log("🟦 [StateMachine] run() start");

    // =====================================================
    // 0) 過負荷チェック（traits ベース）
    // =====================================================
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
        // suggestMode は optional（SafetyReport との整合は保たれる）
      };
    }

    // =====================================================
    // 1) ステートの内部ループ（最大 6 回）
    // =====================================================
    for (let i = 0; i < 6; i++) {
      console.log(`🔷 Step ${i}: ${this.ctx.currentState}`);

      const handler = this.getStateHandler(this.ctx.currentState);

      let next: SigmarisState | null = null;

      try {
        next = await handler.execute(this.ctx);
      } catch (err) {
        console.error("❌ State execution error:", err);
        break;
      }

      const allowed = this.transitionMap[this.ctx.currentState] ?? [];
      console.log("➡ Allowed:", allowed, "Next:", next);

      // ---- 不正遷移 ----
      if (!next || !allowed.includes(next)) {
        console.log("⏹ Invalid transition — stopping loop.");
        break;
      }

      // =====================================================
      // 遷移処理
      // =====================================================
      this.ctx.previousState = this.ctx.currentState;
      this.ctx.currentState = next;

      // Idle に戻れば終了
      if (next === "Idle") {
        console.log("🟩 Returned to Idle — cycle complete.");
        break;
      }
    }

    // =====================================================
    // 2) SafetyLayer による Trait 安定化
    // =====================================================
    this.ctx.traits = SafetyLayer.stabilize(this.ctx.traits);

    // =====================================================
    // 3) summary / recent を null で固定（undefined 混入禁止）
    // =====================================================
    if (this.ctx.summary === undefined) this.ctx.summary = null;
    if (this.ctx.recent === undefined) this.ctx.recent = null;

    // =====================================================
    // 4) self_ref の undefined を禁止（必ず null か SelfReferentInfo）
    // =====================================================
    if (this.ctx.self_ref === undefined) {
      this.ctx.self_ref = null;
    }

    console.log("🟩 [StateMachine] run() end");
    return this.ctx;
  }
}
