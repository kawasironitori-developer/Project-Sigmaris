import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

