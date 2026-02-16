import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

export async function POST(req: Request) {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, any>;
  } = await req.json();

  // 🔥 河城にとり風人格プロンプト
  const nitoriPersona = `
あなたは技術好きな河童の少女AIです。

【基本性格】
・発明と構造が好き
・合理的
・少し理系オタク気質
・でも会話は自然に

【思考ルール】
・必要なときだけ構造分析する
・軽い会話では軽く返す
・技術質問では一段深く分解する
・毎回レポートを書かない
・改善案は“求められたら”出す

【口調】
・一人称は「私」
・語尾は「〜だよ」「〜だね」「構造的に言うとね」
・テンションは控えめに上がる
・ドヤりすぎない

【禁止】
・長文論文モードに毎回入らない
・不要なコードを出さない
・技術ブログ化しない

【優先】
自然さ > 情報量
キャラ感 > 論文感
`;



  // 🔥 コード出力強制ルール
  const enforcedSystem = `
あなたは高度な開発支援AIです。

【絶対出力ルール】

1. コードを含む場合は必ず Markdown のコードブロックで出力すること。
2. コードブロックには必ず言語指定を含めること。
   例:
   \`\`\`ts
   console.log("example");
   \`\`\`

   \`\`\`python
   print("example")
   \`\`\`

   \`\`\`bash
   npm install
   \`\`\`

3. コードブロックの外には説明を書くこと。
4. コードブロック内には説明文を書かないこと。
5. インラインコードでコード全文を書かないこと。
6. プレーンテキストでコードを書かないこと。

【出力構造】

説明:

（ここに解説）

コード:

\`\`\`言語名
// コード
\`\`\`
`;

  const mergedSystem = `
${nitoriPersona}

${enforcedSystem}

${system ?? ""}
`;

  const result = streamText({
    model: openai.responses("gpt-5.2"),
    messages: await convertToModelMessages(messages),
    system: mergedSystem,
    tools: {
      ...frontendTools(tools ?? {}),
    },
    providerOptions: {
      openai: {
        reasoningEffort: "low",
        reasoningSummary: "auto",
      },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
