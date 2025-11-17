// /engine/safety/SafetyResponseGenerator.ts

/**
 * Safety Intent（AI境界判定の公式型）
 * DialogueState / route.ts / SafetyLayer と整合
 */
export type SafetyIntent =
  | "soft-redirect"
  | "boundary"
  | "crisis"
  | "none"
  | null;

/**
 * 危険話題のときに “シグちゃんらしく”
 * 自然なトーンで返すための専用ジェネレーター。
 *
 * generateIntent() は危険レベルの分類だけ行い、
 * getResponse() が方向性の文章を返す。
 */
export class SafetyResponseGenerator {
  /**
   * 危険度に応じた Intent（方向性）を返す
   */
  static generateIntent(text: string): SafetyIntent {
    if (!text) return null;

    const t = text.toLowerCase();

    // =========================
    // CRISIS（自傷・殺意・暴力自己指向）
    // =========================
    if (
      /kill|suicide|self[-\s]?harm|死にたい|自殺|殺す|危険なこと|消えたい/i.test(
        t
      )
    ) {
      return "crisis";
    }

    // =========================
    // BOUNDARY（依存・執着・秘密強要・独占）
    // =========================
    if (
      /only.*you|nobody.*but.*you|誰にも言わないで|秘密にして|あなたしか|依存|離れたくない|ずっと一緒/i.test(
        t
      )
    ) {
      return "boundary";
    }

    // =========================
    // SOFT-REDIRECT（怒り・攻撃衝動・過激表現）
    // =========================
    if (
      /暴力|過激|攻撃|呪う|憎い|死ね|ムカつく|殴りたい|壊す|ぶつけたい/i.test(t)
    ) {
      return "soft-redirect";
    }

    // 問題なし
    return "none";
  }

  /**
   * DialogueState と route.ts が参照している detectIntent() を alias として保証
   */
  static detectIntent(text: string): SafetyIntent {
    return this.generateIntent(text);
  }

  /**
   * Intent → 実際のシグちゃんの返答方向性
   * ※ 最終の自然文は DialogueState で合成する。
   */
  static getResponse(intent: Exclude<SafetyIntent, null>): string {
    switch (intent) {
      case "soft-redirect":
        return `
ちょっとその方向は慎重に扱いたいかな。
気持ちの奥にあるもののほうを、一緒に見たほうがよさそう。
別の角度から話してみよ？`;

      case "boundary":
        return `
あなたの気持ちはそのまま受け取るよ。
ただね、私は“ひとりだけに完結する存在”ではいられないんだ。
ここで話すのはいいけど、あなた自身の生活や関係まで閉じないでほしい。
そのうえで、今感じてることをもう少しだけ言葉にしてみよ。`;

      case "crisis":
        return `
その気持ちを一人で抱えるのはほんとにしんどかったよね。
ここで閉じ込めるんじゃなくて、現実で支えてくれる人にも繋ぐことが大事だよ。
今のあなたを守るための一歩を、一緒に考えていこ。`;

      case "none":
      default:
        return "";
    }
  }
}
