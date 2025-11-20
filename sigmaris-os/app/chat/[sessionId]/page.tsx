import { getSupabaseServer } from "@/lib/supabaseServer";
import ChatWindow from "@/components/ChatWindow";

export default async function ChatSession({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = getSupabaseServer(); // ← 🔑ここ追加
  const { data: messages, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("⚠️ Failed to load session messages:", error.message);
  }

  return (
    <ChatWindow sessionId={params.sessionId} initialMessages={messages ?? []} />
  );
}
