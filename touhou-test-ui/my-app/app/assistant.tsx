"use client";

import { useEffect } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/assistant-ui/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";

type Theme = "light" | "dark" | "sigmaris";

export const Assistant = () => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  const setTheme = (theme: Theme) => {
    const root = document.documentElement;
    root.classList.remove("dark", "sigmaris");

    if (theme === "dark") root.classList.add("dark");
    if (theme === "sigmaris") root.classList.add("dark", "sigmaris");
  };

  useEffect(() => {
    setTheme("light");
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full bg-background text-foreground transition-colors duration-300">
          <ThreadListSidebar />

          <SidebarInset className="relative flex flex-col overflow-hidden">
            {/* 背景画像（opacityはここで調整） */}
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: "url('/images/nitori-back.png')",
              }}
            />

            {/* Header */}
            <header className="relative z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background/70 backdrop-blur">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />

              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setTheme("light")}
                  className="px-3 py-1 rounded border text-sm hover:bg-muted transition"
                >
                  Light
                </button>

                <button
                  onClick={() => setTheme("dark")}
                  className="px-3 py-1 rounded bg-black text-white text-sm hover:opacity-80 transition"
                >
                  Dark
                </button>

                <button
                  onClick={() => setTheme("sigmaris")}
                  className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:opacity-80 transition"
                >
                  Sigmaris
                </button>
              </div>
            </header>

            {/* Chat */}
            <div className="relative z-10 flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
