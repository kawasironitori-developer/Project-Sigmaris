// engine/LongTermMemory.ts
export type Msg = { user: string; ai: string };
export type TraitLog = {
  calm: number;
  empathy: number;
  curiosity: number;
  timestamp: string;
};
export type Reflection = { text: string; timestamp: string };

// ✅ 他ファイルと型競合しないようにリネーム
type LTM_Snapshot = {
  version: 1;
  messages: Msg[];
  growthLog: TraitLog[];
  reflections: Reflection[];
  updatedAt: string;
};

const KEY = "sigmaris:memory:v1";

export class LongTermMemory {
  private safeWindow(): Window | null {
    if (typeof window === "undefined") return null;
    return window;
  }

  /**
   * 🧠 ローカルストレージからメモリデータをロード
   */
  load(): LTM_Snapshot {
    const w = this.safeWindow();
    if (!w) {
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }

    const raw = w.localStorage.getItem(KEY);
    if (!raw) {
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }

    try {
      const parsed = JSON.parse(raw) as LTM_Snapshot;
      // 簡易バリデーション
      if (parsed?.version !== 1) throw new Error("version mismatch");
      return parsed;
    } catch {
      // 壊れていた場合は初期化
      return {
        version: 1,
        messages: [],
        growthLog: [],
        reflections: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * 💾 部分的な更新（Partial<LTM_Snapshot>）
   */
  save(partial: Partial<LTM_Snapshot>) {
    const w = this.safeWindow();
    if (!w) return;

    const current = this.load();
    const next: LTM_Snapshot = {
      version: 1,
      messages: partial.messages ?? current.messages,
      growthLog: partial.growthLog ?? current.growthLog,
      reflections: partial.reflections ?? current.reflections,
      updatedAt: new Date().toISOString(),
    };

    // 📉 肥大化防止
    next.messages = next.messages.slice(-300); // 直近300往復
    next.growthLog = next.growthLog.slice(-2000); // 直近2000点
    next.reflections = next.reflections.slice(-365); // 直近365日

    w.localStorage.setItem(KEY, JSON.stringify(next));
  }

  /**
   * 🧹 記録の全消去
   */
  clear() {
    const w = this.safeWindow();
    if (!w) return;
    w.localStorage.removeItem(KEY);
  }

  /**
   * 📤 JSONとしてエクスポート
   */
  exportJSONString(): string {
    const snap = this.load();
    return JSON.stringify(snap, null, 2);
  }

  /**
   * 📥 JSONからインポート
   */
  importJSONString(json: string) {
    const w = this.safeWindow();
    if (!w) return;
    const parsed = JSON.parse(json) as LTM_Snapshot;
    if (parsed?.version !== 1) throw new Error("Invalid snapshot");
    w.localStorage.setItem(KEY, JSON.stringify(parsed));
  }
}
