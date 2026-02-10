// app/map/session/layout.tsx

import { redirect } from "next/navigation";
import StatusHeader from "@/components/StatusHeader";
import { supabaseServer } from "@/lib/supabase-server";

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ★ supabaseServer は Promise を返すので await 必須
  const supabase = await supabaseServer();

  const { data, error } = await supabase.auth.getUser();

  // ★ セッションが無ければログインへ
  if (error || !data.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ヘッダー：高さ固定 */}
      <div className="h-12 shrink-0">
        <StatusHeader />
      </div>

      {/* マップ本体 */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
