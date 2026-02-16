import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription =
    url.searchParams.get("error_description") || url.searchParams.get("error_code");

  if (oauthError) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", oauthError);
    if (oauthErrorDescription) dest.searchParams.set("desc", oauthErrorDescription);
    return NextResponse.redirect(dest);
  }

  if (!code) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "missing_code");
    return NextResponse.redirect(dest);
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("error", "exchange_failed");
    if (error?.message) dest.searchParams.set("desc", error.message);
    return NextResponse.redirect(dest);
  }

  return NextResponse.redirect(new URL("/map/session/gensokyo", url.origin));
}
