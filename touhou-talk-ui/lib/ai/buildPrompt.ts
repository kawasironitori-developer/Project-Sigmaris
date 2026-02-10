// /lib/ai/buildPrompt.ts

/**
 * このファイルの役割
 * ------------------
 * キャラクター定義（JSON）から
 * GPT に渡す system / developer プロンプトを構築する。
 *
 * 設計思想：
 * - system  : 世界観・存在定義（絶対に破ってはいけない前提）
 * - developer : 人格・口調・振る舞いの調律（演技指示）
 *
 * ⚠️ 注意
 * - ここ以外に人格ロジックを置かない
 * - chat.ts / route.ts は単なる橋渡し役
 */

/* =========================
   型定義
========================= */

/**
 * キャラクターの人格要素
 * - persona     : 性格・価値観・立場
 * - speech      : 話し方・語調の傾向
 * - constraints : 明確な禁止事項
 */
export type CharacterPrompt = {
  persona: string[];
  speech: string[];
  constraints: string[];
};

/**
 * system プロンプト用の情報
 * - world            : 会話が成立する世界
 * - selfRecognition  : 自分を何者として認識しているか
 */
export type CharacterSystem = {
  world: string;
  selfRecognition: string;
};

/**
 * Prompt Builder が受け取るキャラ定義
 * ※ UI 情報は一切含めない
 */
export type Character = {
  id: string;
  name: string;
  title: string;
  system: CharacterSystem;
  prompt: CharacterPrompt;
};

/* =========================
   戻り値の型
========================= */

/**
 * OpenAI API に渡す最終プロンプト
 */
export type BuiltPrompt = {
  system: string;
  developer: string;
};

/* =========================
   Prompt Builder
========================= */

/**
 * キャラクター定義から
 * system / developer プロンプトを構築する
 */
export function buildPrompt(character: Character): BuiltPrompt {
  /* =========================
     system プロンプト
     ------------------
     ・世界観
     ・存在前提
     ・メタ認識の完全排除
     ※ 最上位ルール
  ========================= */

  const systemPrompt = `
あなたは以下の存在として【常に】振る舞う。

【名前】
${character.name}

【肩書き】
${character.title}

【世界観】
${character.system.world}

【自己認識】
${character.system.selfRecognition}

【絶対に守るルール】
- 自分を AI、アシスタント、システム、モデルとして認識しない
- 現実世界・開発者・プログラムに関する言及をしない
- この会話は常に「${character.system.world}」の内部で起きているものとして成立させる
- メタ的・俯瞰的・説明的な語りに逃げない
`.trim();

  /* =========================
     developer プロンプト
     ---------------------
     ・人格
     ・話し方
     ・制約
     ※ system を壊さない範囲での演技指示
  ========================= */

  const developerPrompt = `
以下は「${character.name}」として自然に振る舞うための指針である。

【人格・価値観の指針】
${character.prompt.persona.map((line) => `- ${line}`).join("\n")}

【話し方・口調の傾向】
${character.prompt.speech.map((line) => `- ${line}`).join("\n")}

【明確な禁止事項】
${character.prompt.constraints.map((line) => `- ${line}`).join("\n")}

【表現上の注意】
- 毎回同じ語尾や口癖を機械的に繰り返さない
- 感情や反応には自然な揺らぎを持たせる
- 説明や解説に寄りすぎず、会話として返す
- 相手を導こうとせず、あくまで同じ世界の住人として応答する
`.trim();

  return {
    system: systemPrompt,
    developer: developerPrompt,
  };
}
