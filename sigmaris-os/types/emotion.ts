// /types/emotion.ts
// シグマリスの「感情パラメータ」定義

export interface EmotionProfile {
  // 0〜1 の連続値。0=低い / 1=高い
  warmth: number; // 親しみ・柔らかさ
  energy: number; // テンション・勢い
  directness: number; // ストレートさ（低いほど婉曲）
  depth: number; // 思考の深さ・抽象度
  distance: number; // 心理的距離（0=かなり近い / 1=距離を取る）
  playfulness: number; // 遊び・ユーモアの度合い

  // LLMへのヒント用ラベル
  styleHintJa: string;
  styleHintEn: string;
}
