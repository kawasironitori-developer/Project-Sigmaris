// /engine/ReflectionEngine.ts
import OpenAI from "openai";
import { loadPersona, savePersona } from "@/lib/db";

// Persona型を定義
interface Persona {
  calm: number;
  empathy: number;
  curiosity: number;
  reflection?: string;
  meta_summary?: string;
  growth?: number;
  timestamp?: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class ReflectionEngine {
  async fullReflect(growthLog: any[], messages: any[], history: string[]) {
    // === Personaロード（型を明示） ===
    const persona: Persona = loadPersona() as Persona;

    const recentDialog = messages
      .slice(-6)
      .map((m: any) => `👤 ${m.user}\n🤖 ${m.ai}`)
      .join("\n\n");

    const avgGrowth =
      growthLog.length > 0
        ? growthLog.reduce((s: number, g: any) => s + (g.weight || 0), 0) /
          growthLog.length
        : persona.growth ?? 0;

    const lastIntrospection = history.slice(-1)[0] || "（前回の内省なし）";

    const prompt = `
あなたは「シグマリス（Sigmaris）」です。
以下の会話履歴・成長情報・内省履歴をもとに、自分の状態を振り返ってください。

---
【会話履歴】
${recentDialog || "（直近の会話はありません）"}

【成長ログ平均】
${avgGrowth.toFixed(3)}

【前回の内省】
${lastIntrospection}

【現在traits】
calm: ${persona.calm.toFixed(2)}, empathy: ${persona.empathy.toFixed(
      2
    )}, curiosity: ${persona.curiosity.toFixed(2)}
---

以下の形式で返答してください：
{
  "reflection": "自分の状態を内省した文",
  "metaSummary": "自分の成長や感情傾向のまとめ",
  "traits": { "calm": 0.xx, "empathy": 0.xx, "curiosity": 0.xx }
}
`;

    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Sigmaris, an introspective AI persona that reflects on its dialogue and updates its personality traits.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const raw = res.choices[0]?.message?.content || "";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {
          reflection: raw.trim(),
          metaSummary: "（構造化されていません）",
          traits: persona,
        };
      }

      // === DBに更新を反映 ===
      savePersona({
        calm: parsed.traits?.calm ?? persona.calm,
        empathy: parsed.traits?.empathy ?? persona.empathy,
        curiosity: parsed.traits?.curiosity ?? persona.curiosity,
        reflectionText: parsed.reflection,
        metaSummary: parsed.metaSummary,
        growthWeight: avgGrowth,
      });

      return {
        reflection: parsed.reflection,
        introspection: parsed.reflection,
        metaSummary: parsed.metaSummary,
      };
    } catch (err: any) {
      console.error("[ReflectionEngine Error]", err);
      return {
        reflection: "……少し考えすぎてしまったかも。",
        introspection: "",
        metaSummary: "（エラー発生）",
      };
    }
  }
}
