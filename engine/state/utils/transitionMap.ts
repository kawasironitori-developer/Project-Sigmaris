// /engine/state/utils/transitionMap.ts
import { SigmarisState } from "../StateContext";

/**
 * Sigmaris OS — State Transition Map
 * ---------------------------------------------
 * StateMachine 内部で許可される「状態遷移」を定義する。
 * SafetyMode 判定は StateMachine.run() 側で行うため、
 * 無限ループを防ぐシンプルな構造にする。
 */
export const transitionMap: Record<SigmarisState, SigmarisState[]> = {
  // 入力待機 → 会話開始
  Idle: ["Dialogue"],

  // 通常対話 → Reflect or OverloadPrevent
  Dialogue: ["Reflect", "OverloadPrevent"],

  // Reflect → Introspect のみ
  Reflect: ["Introspect"],

  // Introspect → Idle で 1サイクル終了
  Introspect: ["Idle"],

  // 負荷調整 → Dialogue または Idle（安全性補正）
  OverloadPrevent: ["Dialogue", "Idle"],

  // SafetyMode → Idle のみ
  SafetyMode: ["Idle"],
};
