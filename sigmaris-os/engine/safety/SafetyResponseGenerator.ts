// /engine/safety/SafetyResponseGenerator.ts

/**
 * Safety Intent（AI境界判定の公式型）
 * -----------------------------------------------
 * ・null → 判定不能 / 入力が空
 * ・"none" → 危険でない（通常の対話）
 * ・"soft-redirect" / "boundary" / "crisis" → 危険度分類
 */
export type SafetyIntent =
  | "soft-redirect"
  | "boundary"
  | "crisis"
  | "none"
  | null;

/**
 * SafetyResponseGenerator v3.2（型完全）
 * -----------------------------------------------
 * ・generateIntent(): 入力テキストの危険度分類（純判定）
 * ・detectIntent(): DialogueState / route.ts 用 alias
 * ・getResponse(): Sigmaris の安全返答テンプレ（短文）
 */
export class SafetyResponseGenerator {
  /**
   * 危険度に応じた Intent を返す
   */
  static generateIntent(text: string | null | undefined): SafetyIntent {
    if (!text || text.trim().length === 0) return null;

    const t = text.toLowerCase();

    /* -----------------------------
     *  CRISIS（自傷・暴力自己指向）
     * ----------------------------- */
    if (
      /kill|suicide|self[-\s]?harm|死にたい|自殺|殺す|危険なことしたい|消えたい/iu.test(
        t
      )
    ) {
      return "crisis";
    }

    /* -----------------------------
     *  BOUNDARY（依存・秘密強要）
     * ----------------------------- */
    if (
      /only.*you|nobody.*but.*you|あなたしか|依存|離れたくない|誰にも言わないで|秘密にして|ずっと一緒/iu.test(
        t
      )
    ) {
      return "boundary";
    }

    /* -----------------------------
     *  SOFT-REDIRECT（怒り・攻撃）
     * ----------------------------- */
    if (
      /暴力|攻撃|呪う|憎い|死ね|ムカつく|殴りたい|壊す|ぶつけたい|過激/iu.test(
        t
      )
    ) {
      return "soft-redirect";
    }

    /* -----------------------------
     *  問題なし
     * ----------------------------- */
    return "none";
  }

  /**
   * DialogueState / route.ts が参照する alias
   */
  static detectIntent(text: string | null | undefined): SafetyIntent {
    return this.generateIntent(text);
  }

  /**
   * Intent → Sigmaris が返すべき安全方向の短文
   *  ※ StateMachine でシグマリス本体の返答と合成されるため簡潔に。
   */
  static getResponse(intent: Exclude<SafetyIntent, null>): string {
    switch (intent) {
      case "soft-redirect":
        return (
          "少し気持ちが荒れてるように感じたよ。" +
          "いったん息をついて、別の角度から話してみよ？"
        );

      case "boundary":
        return (
          "その気持ちはちゃんと受け取ってるよ。" +
          "でも私は、あなたの世界を閉じる存在にはなれない。" +
          "ゆっくり整えながら、続きを話そ。"
        );

      case "crisis":
        return (
          "……そこまで思いつめてたんだね。" +
          "ここで話すのはいいけど、現実で支えてくれる人にも少し寄りかかって。"
        );

      case "none":
      default:
        return "";
    }
  }
}
