import fs from "fs";
import path from "path";
import { AEIConfig, AEIInput, MemoryRecord } from "../types";

// Memory Core: JSONファイルに軽量永続化（SQLiteに差し替え可能）
export class MemoryCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir() {
    const dir = path.dirname(this.cfg.memoryPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  readAll(): MemoryRecord[] {
    try {
      const raw = fs.readFileSync(this.cfg.memoryPath, "utf8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch {
      return [];
    }
  }

  write(record: MemoryRecord) {
    this.ensureDir();
    const data = this.readAll();
    data.push(record);
    fs.writeFileSync(
      this.cfg.memoryPath,
      JSON.stringify(data, null, 2),
      "utf8"
    );
    return { wrote: true, path: this.cfg.memoryPath };
  }

  // 単純な長期保存対象判定（好み/設定/方針などのキーワード）
  shouldStore(input: AEIInput, output: string): boolean {
    const txt = `${input.text} ${output}`.toLowerCase();
    const hints = [
      "remember",
      "preference",
      "設定",
      "方針",
      "今後",
      "長期",
      "既定値",
    ];
    return hints.some((h) => txt.includes(h));
  }
}
