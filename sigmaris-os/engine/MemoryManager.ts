export interface MemoryEntry {
  id: number;
  user: string;
  ai: string;
  timestamp: string;
}

export class MemoryManager {
  private logs: MemoryEntry[] = [];

  add(user: string, ai: string) {
    this.logs.push({
      id: this.logs.length + 1,
      user,
      ai,
      timestamp: new Date().toISOString(),
    });
  }

  getAll() {
    return this.logs;
  }
}
