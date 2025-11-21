// /app/api/persona/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import { requestSync, getIdentity } from "@/lib/sigmaris-api";
import { PersonaSync } from "@/engine/sync/PersonaSync";
import type { TraitVector } from "@/lib/traits";

/* -------------------------------------------------------
 * POST: Persona 更新（DB → Python → PersonaSync の完全統合）
 * ----------------------------------------------------- */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      traits, // calm / empathy / curiosity
      reflectionText, // 振り返り
      metaSummary, // meta summary
      growthWeight, // 成長重み（平均など）
    } = body;

    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    /* -------------------------------------------------------
     * ① Next.js DB 側に Persona upsert
     * ----------------------------------------------------- */
    const payloadDB = {
      user_id: user.id,
      calm: traits?.calm ?? 0,
      empathy: traits?.empathy ?? 0,
      curiosity: traits?.curiosity ?? 0,
      reflection: reflectionText ?? "",
      meta_summary: metaSummary ?? "",
      growth: growthWeight ?? 0,
      updated_at: now,
    };

    const { error: upsertError } = await supabase
      .from("persona")
      .upsert(payloadDB, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Persona upsert failed:", upsertError);
      throw upsertError;
    }

    /* -------------------------------------------------------
     * ② PersonaSync.update（B仕様）に完全統合
     * ----------------------------------------------------- */
    const traitVector: TraitVector = {
      calm: traits?.calm ?? 0,
      empathy: traits?.empathy ?? 0,
      curiosity: traits?.curiosity ?? 0,
    };

    await PersonaSync.update(
      {
        traits: traitVector,
        summary: metaSummary ?? "",
        growth: growthWeight ?? 0,
        timestamp: now,
        baseline: null,
        identitySnapshot: {
          reflection: reflectionText ?? "",
        },
      },
      user.id
    );

    /* -------------------------------------------------------
     * ③ Python IdentityCore にも統合反映
     *     （B仕様サブセット：Identity only）
     * ----------------------------------------------------- */
    try {
      await requestSync({
        chat: null,
        context: {
          traits: traitVector,
          summary: metaSummary ?? "",
          safety: null,
          recent: null,
        },
        identity: {
          reflection: reflectionText ?? "",
          meta_summary: metaSummary ?? "",
          growth: growthWeight ?? 0,
        },
      });
    } catch (e) {
      console.warn("⚠ Python Identity Sync failed:", e);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("❌ POST /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------
 * GET: Persona + Python Identity Snapshot（フル統合）
 * ----------------------------------------------------- */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* -------------------------------------------------------
     * ① DB Persona 読み込み
     * ----------------------------------------------------- */
    const { data: persona, error: dbError } = await supabase
      .from("persona")
      .select(
        "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) throw dbError;

    /* -------------------------------------------------------
     * ② Python Identity Snapshot 読み込み
     * ----------------------------------------------------- */
    let identity: any = null;
    try {
      identity = await getIdentity();
    } catch {
      console.warn("⚠ getIdentity() failed, using DB only");
    }

    /* -------------------------------------------------------
     * ③ Persona 統合（優先順位： Python > DB > デフォルト）
     * ----------------------------------------------------- */
    const merged = {
      traits: {
        calm: identity?.calm ?? persona?.calm ?? 0.5,
        empathy: identity?.empathy ?? persona?.empathy ?? 0.5,
        curiosity: identity?.curiosity ?? persona?.curiosity ?? 0.5,
      },

      reflection: identity?.reflection ?? persona?.reflection ?? "",
      summary: identity?.meta_summary ?? persona?.meta_summary ?? "",

      baseline: identity?.baseline ?? null,
      persona_vector: identity?.persona_vector ?? null,

      growth: persona?.growth ?? 0,
      updated_at:
        identity?.timestamp ?? persona?.updated_at ?? new Date().toISOString(),
    };

    return NextResponse.json(merged);
  } catch (e: any) {
    console.error("❌ GET /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
