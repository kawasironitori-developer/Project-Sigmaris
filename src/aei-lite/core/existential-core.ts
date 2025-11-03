import { AEIConfig, AEIInput, AEIOutput } from "../types";
import { LogicCore } from "./logic-core";
import { MemoryCore } from "./memory-core";
import { SafetyCore } from "./safety-core";
import { GrowthCore } from "./growth-core";

// Existential Core: 統合ループ（Reflection → Introspection → Meta-Reflection）
export class ExistentialCore {
  private logic: LogicCore;
  private memory: MemoryCore;
  private safety: SafetyCore;
  private growth: GrowthCore;

  constructor(cfg: AEIConfig) {
    this.logic = new LogicCore(cfg);
    this.memory = new MemoryCore(cfg);
    this.safety = new SafetyCore(cfg);
    this.growth = new GrowthCore(cfg);
  }

  // Normalize（ここでは軽処理）
  private normalize(input: AEIInput): AEIInput {
    const text = (input.text ?? "").trim();
    return {
      ...input,
      text,
      meta: input.meta ?? { role: "user", timestamp: Date.now() },
    };
  }

  // Reflection（ログ要約/軽内省はここで拡張可）
  private reflection(_input: AEIInput, _output: string) {
    // ここでは軽量化のためNOP。必要なら要約やタグ抽出などを追加。
    return;
  }

  // メイン処理
  async process(input: AEIInput): Promise<AEIOutput> {
    // 1) Normalize
    const norm = this.normalize(input);

    // 2) Safety pre-check（入力）
    const pre = this.safety.check(norm.text);
    if (pre.flagged && pre.safeText !== norm.text) {
      norm.text = pre.safeText;
    }

    // 3) Logic（OpenAI呼び出し）
    const { text: raw, usage } = await this.logic.ask(norm);

    // 4) Safety post-check（出力）
    const post = this.safety.postFilter(raw);
    const outText = post.safeText;

    // 5) Memory（必要時のみ保存）
    let memoryRef: AEIOutput["memoryRef"] = { wrote: false };
    if (this.memory.shouldStore(norm, outText)) {
      const rec = {
        ts: Date.now(),
        in: norm.text,
        out: outText,
        meta: norm.meta ?? {},
      };
      memoryRef = this.memory.write(rec);
    }

    // 6) Growth（微調整：反復/明瞭度を簡易近似）
    const signalStrength = Math.min(
      0.02,
      Math.max(0, norm.text.length > 50 ? 0.01 : 0.005)
    );
    const g = this.growth.update(signalStrength);

    // 7) Reflection（軽内省）
    this.reflection(norm, outText);

    // 8) Format
    return {
      output: outText,
      tokens: {
        prompt: usage?.prompt_tokens,
        completion: usage?.completion_tokens,
        total: usage?.total_tokens,
      },
      safety: { flagged: post.flagged, reasons: post.reasons },
      memoryRef,
      growth: { updated: true, weight: g.weight },
    };
  }
}
