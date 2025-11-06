import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// ====== POST: 保存処理 ======
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { traits, reflectionText, metaSummary, growthWeight } = body;

    // Supabaseクライアント（認証付き）
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = {
      user_id: user.id,
      calm: traits?.calm ?? 0,
      empathy: traits?.empathy ?? 0,
      curiosity: traits?.curiosity ?? 0,
      reflection: reflectionText ?? "",
      meta_summary: metaSummary ?? "",
      growth: growthWeight ?? 0,
      updated_at: new Date().toISOString(),
    };

    // ✅ 「user_id」列が UNIQUE でないときも安全に動作
    const { error: upsertError } = await supabase
      .from("persona")
      .upsert(payload, { onConflict: "user_id" });

    // UNIQUE制約がない場合のフォールバック
    if (upsertError?.code === "42P10") {
      console.warn(
        "⚠ persona.user_id に UNIQUE 制約がないため、通常 insert にフォールバックします。"
      );
      await supabase.from("persona").insert(payload);
    } else if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({ status: "saved" });
  } catch (e: any) {
    console.error("POST /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  }
}

// ====== GET: 取得処理 ======
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error: dbError } = await supabase
      .from("persona")
      .select(
        "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(); // ✅ multiple rowsエラー防止

    if (dbError) throw dbError;

    // 初回アクセスなどデータなしの場合のデフォルト値
    if (!data) {
      return NextResponse.json({
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        reflection: "",
        meta_summary: "",
        growth: 0,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error("GET /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message || String(e) },
      { status: 500 }
    );
  }
}
