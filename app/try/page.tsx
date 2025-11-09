"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "ai"; content: string };

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "trial-" + crypto.randomUUID();
  let id = localStorage.getItem("trySessionId");
  if (!id) {
    id = "trial-" + crypto.randomUUID();
    localStorage.setItem("trySessionId", id);
  }
  return id;
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRemaining(): number {
  if (typeof window === "undefined") return 10;
  const key = "tryDaily_" + getTodayKey();
  const used = Number(localStorage.getItem(key) || "0");
  return Math.max(0, 10 - used);
}

function bumpUsage() {
  const key = "tryDaily_" + getTodayKey();
  const used = Number(localStorage.getItem(key) || "0");
  localStorage.setItem(key, String(used + 1));
}

export default function TryPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      content:
        "ここは Sigmaris OS（体験版）。ログイン不要で短い対話を試せるよ。1日10回まで／15秒クールダウン。気に入ったら本登録でフル機能をどうぞ。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);
  const sessionId = useMemo(getOrCreateSessionId, []);
  const remaining = getRemaining();

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [cooldown]);

  async function send() {
    if (!input.trim()) return;
    if (loading) return;
    if (cooldown > 0) return;
    if (getRemaining() <= 0) {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          content:
            "今日のお試し上限（10回）に達しました。登録すると制限が緩和されます。\n→ /register から機能一覧と登録手順を確認してください。",
        },
      ]);
      return;
    }

    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userText }]);
    setLoading(true);

    try {
      const res = await fetch("/api/try", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ text: userText }),
      });

      // サーバ側でクールダウン秒を返す（任意）
      const cd = Number(res.headers.get("X-Cooldown-Seconds") || "15");
      setCooldown(cd);

      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "ai",
            content:
              data?.error ??
              "サーバが混み合っています。しばらくしてからお試しください。",
          },
        ]);
      } else {
        bumpUsage();
        setMessages((m) => [...m, { role: "ai", content: data.output }]);
      }
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "ai", content: "ネットワークエラー。再試行してください。" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sigmaris OS — お試し版</h1>
        <div className="text-sm opacity-70">
          残り <b>{remaining}</b>/10 ・
          {cooldown > 0 ? `CD ${cooldown}s` : "送信可"}
        </div>
      </header>

      <div className="border rounded-lg p-4 space-y-3 bg-neutral-50">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "text-right" : "text-left"}
          >
            <div
              className={
                "inline-block whitespace-pre-wrap rounded-lg px-3 py-2 " +
                (m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border")
              }
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <textarea
          className="flex-1 border rounded-md p-2 min-h-[64px]"
          placeholder="短いメッセージで試してみよう（例：『どんなことができるの？』）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          disabled={loading || cooldown > 0}
          onClick={send}
          className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-50"
        >
          送信
        </button>
      </div>

      <div className="text-sm opacity-70 leading-relaxed">
        ・1日10回／15秒クールダウンの簡易体験です。
        ・内容は保存されません（個人情報を送らないでください）。 ・気に入ったら{" "}
        <a href="/register" className="underline">
          /register
        </a>{" "}
        → ログインでフル機能へ。
      </div>
    </div>
  );
}
