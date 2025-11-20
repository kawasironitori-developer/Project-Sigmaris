import fs from "fs";
import path from "path";
import { AEIConfig } from "../types";

// Growth Core: 学習“傾向”の微調整（人格は書き換えない）
interface GrowthState {
  weight: number; // 0.0 - 1.0 で微増
  trend: "concise" | "structured" | "friendly";
  last_update: number;
}

export class GrowthCore {
  constructor(private cfg: AEIConfig) {}

  private ensureDir(p: string) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  read(): GrowthState {
    try {
      const raw = fs.readFileSync(this.cfg.growthPath, "utf8");
      return JSON.parse(raw) as GrowthState;
    } catch {
      return { weight: 0.1, trend: "concise", last_update: Date.now() };
    }
  }

  write(state: GrowthState) {
    this.ensureDir(this.cfg.growthPath);
    fs.writeFileSync(
      this.cfg.growthPath,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  }

  // 連続して同じ話題や明瞭な指示が来たら微増
  update(signalStrength: number): GrowthState {
    const curr = this.read();
    const inc = Math.min(Math.max(signalStrength, 0), 0.02); // 1回あたり最大 +0.02
    const next = {
      ...curr,
      weight: Math.min(1.0, curr.weight + inc),
      last_update: Date.now(),
    };
    this.write(next);
    return next;
  }
}
