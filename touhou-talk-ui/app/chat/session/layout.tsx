import { redirect } from "next/navigation";
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
    <div className="flex h-dvh flex-col overflow-hidden">{children}</div>
  );
}
