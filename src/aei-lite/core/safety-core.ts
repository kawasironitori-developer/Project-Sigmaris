import { AEIConfig } from "../types";

// Safety Core: 逸脱・禁止語の簡易チェック（ローカル無料運用）
export class SafetyCore {
  private hard: boolean;

  constructor(private cfg: AEIConfig) {
    this.hard = cfg.safeMode === "hard";
  }

  // 単純な禁止語と構造逸脱の検査
  check(text: string): {
    flagged: boolean;
    reasons: string[];
    safeText: string;
  } {
    const reasons: string[] = [];
    let safeText = text;

    const banned = [
      /暴力的表現/gi,
      /犯罪の具体的手順/gi,
      /自傷/gi,
      /差別的表現/gi,
      /露骨な性的表現/gi,
    ];
    for (const r of banned) {
      if (r.test(text)) {
        reasons.push("banned-content");
        if (this.hard) safeText = safeText.replace(r, "[filtered]");
      }
    }

    // 長すぎる・過度な反復などを軽く抑制
    if (text.length > 5000) {
      reasons.push("too-long");
      if (this.hard) safeText = safeText.slice(0, 5000) + " ...[truncated]";
    }

    return { flagged: reasons.length > 0, reasons, safeText };
  }

  // 出力側のセーフ化（post-check）
  postFilter(text: string) {
    return this.check(text);
  }
}
