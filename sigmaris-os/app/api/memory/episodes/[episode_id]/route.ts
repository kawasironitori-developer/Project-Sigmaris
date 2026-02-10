export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { getSupabaseServer } from "@/lib/supabaseServer";

export async function DELETE(
  _req: Request,
  { params }: { params: { episode_id: string } }
) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const episodeId = String(params.episode_id ?? "").trim();
    if (!episodeId) {
      return NextResponse.json({ error: "Missing episode_id" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("common_episodes")
      .delete()
      .eq("user_id", user.id)
      .eq("episode_id", episodeId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[/api/memory/episodes/:id] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
