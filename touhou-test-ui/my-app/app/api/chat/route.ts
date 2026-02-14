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

  const result = streamText({
    model: openai.responses("gpt-5-nano"),
    messages: await convertToModelMessages(messages),
    system: system ? enforcedSystem + "\n\n" + system : enforcedSystem,
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
