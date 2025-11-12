import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // 🚧 セーフガード：code が無ければ /auth/login へ
  if (!code) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const cookieStore = (await cookies()) as unknown as ReadonlyRequestCookies;

  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore,
  });

  // 🧠 OAuth セッション交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  // ❗ エラーハンドリング
  if (error || !data?.session) {
    return NextResponse.redirect(
      new URL("/auth/login?error=exchange_failed", request.url)
    );
  }

  // ✅ 正常認証 → トップへ遷移
  // Vercel 側のセキュリティチェックを回避するため、絶対URLを明示
  const redirectUrl = new URL("/", url.origin);
  return NextResponse.redirect(redirectUrl);
}
