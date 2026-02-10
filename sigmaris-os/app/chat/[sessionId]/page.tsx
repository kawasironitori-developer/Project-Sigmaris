import { getSupabaseComponent, getSupabaseServer } from "@/lib/supabaseServer";
import ChatWindow from "@/components/ChatWindow";

export default async function ChatSession({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabaseAuth = await getSupabaseComponent();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return <ChatWindow sessionId={params.sessionId} initialMessages={[]} />;
  }
  const supabase = getSupabaseServer(); // ← 🔑ここ追加
  const { data: messages, error } = await supabase
    .from("common_messages")
    .select("role, content, created_at")
    .eq("app", "sigmaris")
    .eq("user_id", user.id)
    .eq("session_id", params.sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("⚠️ Failed to load session messages:", error.message);
  }

  return (
    <ChatWindow sessionId={params.sessionId} initialMessages={messages ?? []} />
  );
}
