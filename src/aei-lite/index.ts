import { defaultConfig } from "./config";
import { AEIInput, AEIOutput } from "./types";
import { ExistentialCore } from "./core/existential-core";

// AEI Lite の初期化関数
const core = new ExistentialCore(defaultConfig);

export async function runAEI(input: AEIInput): Promise<AEIOutput> {
  return core.process(input);
}

// ローカルCLIテスト用
if (require.main === module) {
  (async () => {
    const text = process.argv.slice(2).join(" ") || "Hello, what is AEI?";
    const res = await runAEI({ text, meta: { role: "user", timestamp: Date.now() } });
    console.log(JSON.stringify(res, null, 2));
  })();
}
