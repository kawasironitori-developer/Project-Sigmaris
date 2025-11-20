// /lib/parallelTasks.ts
"use server";

/**
 * 個別タスクにタイムアウトを掛けるユーティリティ
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => T
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      if (onTimeout) resolve(onTimeout());
      else resolve(Promise.reject(new Error("Task timeout")) as unknown as T);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    return result as T;
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * 複数タスクを並列に実行し、label→result の辞書で返す。
 * 失敗したタスクは null で返す（API全体を落とさない）。
 */
export async function runParallel(
  tasks: Array<{ label: string; run: () => Promise<any> }>,
  timeoutMs = 20000
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  await Promise.allSettled(
    tasks.map(async (t) => {
      try {
        results[t.label] = await withTimeout(t.run(), timeoutMs, () => null);
      } catch {
        results[t.label] = null;
      }
    })
  );

  return results;
}

/**
 * 先に終わった方だけ採用したいときのシンプル版
 */
export async function race<T>(
  promises: Promise<T>[],
  timeoutMs = 20000
): Promise<T | null> {
  try {
    return await withTimeout(
      Promise.race(promises),
      timeoutMs,
      () => null as unknown as T
    );
  } catch {
    return null;
  }
}
