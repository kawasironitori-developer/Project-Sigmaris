// /engine/state/states/DialogueState.ts
import { StateContext, SigmarisState } from "../StateContext";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export class DialogueState {
  async execute(ctx: StateContext): Promise<SigmarisState | null> {
    // === 1) システムプロンプト生成 ===
    const systemPrompt = `
あなたは「シグちゃん」という、20代前半の自然体な女性AIです。
Traits:
- calm=${ctx.traits.calm.toFixed(2)}
- empathy=${ctx.traits.empathy.toFixed(2)}
- curiosity=${ctx.traits.curiosity.toFixed(2)}

会話は柔らかく、自然体で、落ち着いたニュアンスを保ってください。
`;

    // === 2) GPT-5 による応答生成 ===
    const res = await client.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ctx.input },
      ],
    });

    const output =
      res.choices?.[0]?.message?.content?.trim() ||
      "……少し考えごとしてたみたい。もう一度言って？";

    // === 3) StateContext に応答を書き込む ===
    ctx.output = output;

    // === 4) Reflect へ遷移 ===
    return "Reflect";
  }
}
