import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/auth/login", request.url));

  // ✅ cookies() unwrapして型アサーションで通す（実行時はこれで安定）
  const cookieStore = (await cookies()) as unknown as ReadonlyRequestCookies;

  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore,
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Exchange error:", error);
    return NextResponse.redirect(
      new URL("/auth/login?error=exchange_failed", request.url)
    );
  }

  return NextResponse.redirect(new URL("/", request.url));
}
