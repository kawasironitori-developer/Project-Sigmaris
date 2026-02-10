import { redirect } from "next/navigation";
import StatusHeader from "@/components/StatusHeader";
import { supabaseServer } from "@/lib/supabase-server";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ★ await を付ける（これが足りてなかった）
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="h-12 shrink-0">
        <StatusHeader />
      </div>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
