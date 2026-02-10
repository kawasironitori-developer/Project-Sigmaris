// hooks/useChatController.ts
"use client";

import { useCallback, useMemo, useState } from "react";

export type ControlState =
  | "idle"
  | "analyzing"
  | "analysis_done"
  | "diffing"
  | "diff_ready"
  | "applying"
  | "applied"
  | "error";

export type Channel = "talk" | "vscode";

export type Attachment = {
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
};

export type SendPayload = {
  text: string;
  files: File[];
  attachments?: Attachment[];
};

// UIが表示するメッセージ構造（あなたの型に合わせる）
export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  speakerId?: string;
  attachments?: Attachment[];
  meta?: {
    diff?: string;
    touched_files?: string[];
    next_action?: string;
  } | null;
};

// backendから返る想定（最低限）
type AnalyzeResponse = {
  ok: boolean;
  message: string;
  touched_files?: string[];
  next_action?: string; // "diff" など
};

type DiffResponse = {
  ok: boolean;
  message: string;
  touched_files?: string[];
  diff?: string;
  next_action?: string; // "apply" など
};

type ApplyResponse = {
  ok: boolean;
  message: string;
};

type Options = {
  channel: Channel;
  // APIのベースURL。Next.jsの /api 経由なら "" でもいい
  apiBase?: string;
  // 親がmessagesを管理してるなら appendMessage を渡す
  appendMessage: (m: Message) => void;
};

function makeId() {
  return crypto.randomUUID();
}

// 雑な intent 推定（後で強化できる）
function inferIntent(text: string, state: ControlState) {
  const t = text.trim().toLowerCase();

  // ユーザーが明示的に言った場合
  const wantsDiff = /diff|差分|変更案|パッチ/.test(t);
  const wantsApply = /apply|適用|反映|実行|やって/.test(t);
  const cancel = /やめ|取消|キャンセル|stop/.test(t);

  if (cancel) return "cancel" as const;

  // 状態優先
  if (state === "idle") return "analyze" as const;
  if (state === "analysis_done")
    return wantsDiff ? ("request_diff" as const) : ("normal_chat" as const);
  if (state === "diff_ready")
    return wantsApply ? ("apply" as const) : ("normal_chat" as const);

  // 処理中は基本無視
  if (state === "analyzing" || state === "diffing" || state === "applying")
    return "normal_chat" as const;

  // fallback
  return "normal_chat" as const;
}

export function useChatController(opts: Options) {
  const { channel, apiBase = "", appendMessage } = opts;

  const [controlState, setControlState] = useState<ControlState>("idle");
  const [lastTouchedFiles, setLastTouchedFiles] = useState<string[]>([]);
  const [lastDiff, setLastDiff] = useState<string | null>(null);

  const canSend = useMemo(() => {
    // 処理中は送信不可（ここは好みで変えていい）
    return !(
      controlState === "analyzing" ||
      controlState === "diffing" ||
      controlState === "applying"
    );
  }, [controlState]);

  const hint = useMemo(() => {
    if (channel !== "vscode") return undefined;

    switch (controlState) {
      case "idle":
        return "変更したい内容を自然文で書け（まず解析する）";
      case "analysis_done":
        return "「diff出して」などで差分生成へ進める";
      case "diff_ready":
        return "「適用して」で反映（VS Code側へ）";
      case "applied":
        return "完了。別の変更ならそのまま続けてOK";
      case "error":
        return "エラー。状況を追加で書くか、やり直す";
      default:
        return "処理中…";
    }
  }, [channel, controlState]);

  // ---- API helpers ----

  const postJson = useCallback(
    async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    },
    [apiBase]
  );

  // ---- Core actions ----

  const runAnalyze = useCallback(
    async (payload: SendPayload) => {
      setControlState("analyzing");

      // backendへ：ユーザーの指示 + 添付のメタ（必要ならbase64等は別途）
      const r = await postJson<AnalyzeResponse>("/api/vscode/analyze", {
        text: payload.text,
        // filesはこのまま送れないので、必要なら別アップロードルートにする
        // 今は text だけで進める前提
      });

      if (!r.ok) {
        setControlState("error");
        appendMessage({
          id: makeId(),
          role: "ai",
          content: `analyze失敗: ${r.message}`,
          meta: { next_action: "retry_analyze" },
        });
        return;
      }

      const touched = r.touched_files ?? [];
      setLastTouchedFiles(touched);
      setControlState("analysis_done");

      appendMessage({
        id: makeId(),
        role: "ai",
        content: r.message,
        meta: {
          touched_files: touched,
          next_action: r.next_action ?? "diff",
        },
      });
    },
    [appendMessage, postJson]
  );

  const runDiff = useCallback(async () => {
    setControlState("diffing");

    const r = await postJson<DiffResponse>("/api/vscode/diff", {
      // 直前analyze結果に紐づく sessionId を持たせるのが理想だが
      // まずは backend 側で直近状態を持たず、UIが必要情報を渡す方式に寄せる
      touched_files: lastTouchedFiles,
    });

    if (!r.ok) {
      setControlState("error");
      appendMessage({
        id: makeId(),
        role: "ai",
        content: `diff失敗: ${r.message}`,
        meta: { next_action: "retry_diff" },
      });
      return;
    }

    setLastTouchedFiles(r.touched_files ?? lastTouchedFiles);
    setLastDiff(r.diff ?? null);
    setControlState("diff_ready");

    appendMessage({
      id: makeId(),
      role: "ai",
      content: r.message,
      meta: {
        touched_files: r.touched_files ?? lastTouchedFiles,
        diff: r.diff,
        next_action: r.next_action ?? "apply",
      },
    });
  }, [appendMessage, lastTouchedFiles, postJson]);

  const runApply = useCallback(async () => {
    setControlState("applying");

    const r = await postJson<ApplyResponse>("/api/vscode/apply", {
      // VSCode側に渡すのは diff か、変更計画ID
      diff: lastDiff,
      touched_files: lastTouchedFiles,
    });

    if (!r.ok) {
      setControlState("error");
      appendMessage({
        id: makeId(),
        role: "ai",
        content: `apply失敗: ${r.message}`,
        meta: { next_action: "retry_apply" },
      });
      return;
    }

    setControlState("applied");
    appendMessage({
      id: makeId(),
      role: "ai",
      content: r.message,
      meta: { next_action: "done" },
    });
  }, [appendMessage, lastDiff, lastTouchedFiles, postJson]);

  const reset = useCallback(() => {
    setControlState("idle");
    setLastTouchedFiles([]);
    setLastDiff(null);
  }, []);

  // ---- Public send (ChatPaneから呼ぶ) ----

  const send = useCallback(
    async (payload: SendPayload) => {
      // 1) ユーザーメッセージを即時append（UI体験のため）
      appendMessage({
        id: makeId(),
        role: "user",
        content: payload.text,
        attachments: payload.attachments,
        meta: null,
      });

      // talkなら通常チャットへ（ここはあなたの既存ルートに接続）
      if (channel === "talk") {
        // 既存の onSend をここに繋ぐ or 親で分岐
        // ここでは “制御しない”
        appendMessage({
          id: makeId(),
          role: "ai",
          content: "（talk チャンネルの送信先に接続していない。親で実装する）",
          meta: null,
        });
        return;
      }

      // vscodeチャンネルなら state machine を回す
      const intent = inferIntent(payload.text, controlState);

      if (intent === "cancel") {
        reset();
        appendMessage({
          id: makeId(),
          role: "ai",
          content: "キャンセルした。idleに戻した。",
          meta: { next_action: "analyze" },
        });
        return;
      }

      // 状態に応じて強制的に次アクションを選ぶ（ここが制御）
      try {
        if (controlState === "idle") {
          await runAnalyze(payload);
          return;
        }
        if (controlState === "analysis_done") {
          if (intent === "request_diff") {
            await runDiff();
            return;
          }
          // diff要求でないなら追加情報として再analyzeしてもいい
          await runAnalyze(payload);
          return;
        }
        if (controlState === "diff_ready") {
          if (intent === "apply") {
            await runApply();
            return;
          }
          // apply要求でないなら補足として再analyze
          await runAnalyze(payload);
          return;
        }

        // その他（処理中/エラー）は無視 or 案内
        appendMessage({
          id: makeId(),
          role: "ai",
          content: `現在の状態: ${controlState}。処理が終わるまで待て。`,
          meta: null,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);

        setControlState("error");
        appendMessage({
          id: makeId(),
          role: "ai",
          content: `例外: ${message}`,
          meta: { next_action: "retry" },
        });
      }
    },
    [appendMessage, channel, controlState, reset, runAnalyze, runApply, runDiff]
  );

  return {
    controlState,
    canSend,
    hint,
    send,
    reset,
  };
}
