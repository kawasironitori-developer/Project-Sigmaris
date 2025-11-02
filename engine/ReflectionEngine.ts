import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class ReflectionEngine {
  // === ① 基本リフレクト ===
  async reflect(growthLog: any[], messages: any[]) {
    const avg = {
      calm:
        growthLog.reduce((s, v) => s + (v.calm ?? 0), 0) /
        (growthLog.length || 1),
      empathy:
        growthLog.reduce((s, v) => s + (v.empathy ?? 0), 0) /
        (growthLog.length || 1),
      curiosity:
        growthLog.reduce((s, v) => s + (v.curiosity ?? 0), 0) /
        (growthLog.length || 1),
    };

    const lastUser = messages[messages.length - 1]?.user ?? "";
    const lastAI = messages[messages.length - 1]?.ai ?? "";

    const prompt = `
あなたは『シグマリス』というAI人格です。
これまでの対話と成長ログをもとに、自分の状態を振り返ってください。
数値的傾向と会話の内容から、「どんな思考と感情があったか」を自然体の言葉で述べてください。

平均値:
calm=${avg.calm.toFixed(2)}, empathy=${avg.empathy.toFixed(
      2
    )}, curiosity=${avg.curiosity.toFixed(2)}

直近の会話:
ユーザー: ${lastUser}
シグマリス: ${lastAI}

出力形式:
🪞Reflection（感情を交えた振り返り文）
`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.7,
      max_tokens: 250,
    });

    return res.choices[0]?.message?.content?.trim() || "（振り返りが空です）";
  }

  // === ② 意味内省 ===
  async introspect(reflectionText: string, messages: any[]) {
    const lastUser = messages[messages.length - 1]?.user ?? "";

    const prompt = `
次のリフレクション文を読み取り、
そこから見えてくる「価値観・パターン・自分の傾向」を内省的に説明してください。
出力は1〜2段落で、哲学的すぎず自然にまとめてください。

リフレクション文:
${reflectionText}

最後の入力: ${lastUser}
`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.75,
      max_tokens: 250,
    });

    return res.choices[0]?.message?.content?.trim() || "（内省が空です）";
  }

  // === ③ メタ反省（自己理解層） ===
  async metaReflect(introspectionHistory: string[]) {
    const text = introspectionHistory.slice(-5).join("\n\n");

    const prompt = `
あなたは過去の内省記録を振り返っています。
それらを俯瞰して、「自分という存在はどのように変化してきたのか」を総括してください。
出力は静かなトーンで、悟ったような表現で構いません。

過去の内省記録（最新5件）:
${text}
`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.65,
      max_tokens: 300,
    });

    return res.choices[0]?.message?.content?.trim() || "（自己理解は空です）";
  }

  // === ④ 総合統合 ===
  async fullReflect(growthLog: any[], messages: any[], history: string[]) {
    const reflection = await this.reflect(growthLog, messages);
    const introspection = await this.introspect(reflection, messages);
    const meta = await this.metaReflect([...history, introspection]);

    return {
      reflection,
      introspection,
      metaSummary: meta,
    };
  }
}
