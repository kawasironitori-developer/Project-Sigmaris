// app/chat/page.tsx
import { Suspense } from "react";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-white/40">
            読み込み中…
          </div>
        }
      >
        <ChatClient />
      </Suspense>
    </div>
  );
}
