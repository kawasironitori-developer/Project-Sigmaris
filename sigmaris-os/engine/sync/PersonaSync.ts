// /engine/sync/PersonaSync.ts
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { TraitVector } from "@/lib/traits";

/** Persona テーブルのレコード型（B仕様完全対応） */
export interface PersonaRecord extends TraitVector {
  reflection?: string;
  meta_summary?: string;
  summary?: string | null;
  growth?: number;
  baseline?: {
    calm: number;
    empathy: number;
    curiosity: number;
  } | null;
  identity_snapshot?: any;
  timestamp?: string;
}

export class PersonaSync {
  /**
   * Persona を Supabase からロード
   */
  static async load(userId: string): Promise<PersonaRecord> {
    try {
      if (!userId) throw new Error("User ID missing in PersonaSync.load");

      const supabase = getSupabaseServer();

      const { data, error } = await supabase
        .from("persona")
        .select(
          `
          calm,
          empathy,
          curiosity,
          reflection,
          meta_summary,
          summary,
          growth,
          baseline,
          identity_snapshot,
          updated_at
        `
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return {
        calm: Number(data?.calm ?? 0.5),
        empathy: Number(data?.empathy ?? 0.5),
        curiosity: Number(data?.curiosity ?? 0.5),
        reflection: data?.reflection ?? "",
        meta_summary: data?.meta_summary ?? "",
        summary: data?.summary ?? null,
        growth: Number(data?.growth ?? 0),
        baseline: data?.baseline ?? null,
        identity_snapshot: data?.identity_snapshot ?? null,
        timestamp: data?.updated_at ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error("⚠️ [PersonaSync.load] failed:", err);
      return {
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        reflection: "",
        meta_summary: "",
        summary: null,
        growth: 0,
        baseline: null,
        identity_snapshot: null,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Persona を Supabase に保存（B仕様：payload完全統合）
   */
  static async update(
    payload: {
      traits: TraitVector;
      summary: string;
      growth: number;
      timestamp: string;
      baseline?: TraitVector | null;
      identitySnapshot?: any;
    },
    userId: string
  ) {
    try {
      if (!userId) throw new Error("User ID missing in PersonaSync.update");

      // ───────────────────────────────
      //  防御：traits shape が壊れていないかチェック
      // ───────────────────────────────
      const t = payload.traits ?? {};
      const safeTraits: TraitVector = {
        calm: Number(t.calm ?? 0.5),
        empathy: Number(t.empathy ?? 0.5),
        curiosity: Number(t.curiosity ?? 0.5),
      };

      const supabase = getSupabaseServer();

      const reflectionText =
        payload.summary && payload.summary.length > 0
          ? `(reflect) ${payload.summary.slice(0, 80)}...`
          : `(auto-reflection @ ${new Date().toLocaleTimeString("ja-JP")})`;

      const dbPayload = {
        user_id: userId,

        calm: safeTraits.calm,
        empathy: safeTraits.empathy,
        curiosity: safeTraits.curiosity,

        reflection: reflectionText,
        meta_summary: payload.summary ?? "",
        summary: payload.summary ?? null,

        growth: Number(payload.growth ?? 0),

        baseline: payload.baseline ?? null,
        identity_snapshot: payload.identitySnapshot ?? null,

        updated_at: payload.timestamp ?? new Date().toISOString(),
      };

      const { error } = await supabase
        .from("persona")
        .upsert(dbPayload, { onConflict: "user_id" });

      if (error) throw error;

      console.log("☁️ [PersonaSync.update] updated:", {
        traits: safeTraits, // ← ここを完全修正
        summaryPreview: (payload.summary ?? "").slice(0, 50),
        growth: dbPayload.growth,
      });
    } catch (err) {
      console.error("⚠️ [PersonaSync.update] failed:", err);
    }
  }

  /**
   * Persona リセット（開発用）
   */
  static async reset(userId: string) {
    try {
      if (!userId) throw new Error("User ID missing in PersonaSync.reset");

      const supabase = getSupabaseServer();
      const now = new Date().toISOString();

      const { error } = await supabase.from("persona").upsert(
        {
          user_id: userId,
          calm: 0.5,
          empathy: 0.5,
          curiosity: 0.5,
          reflection: "",
          meta_summary: "Reset",
          summary: null,
          growth: 0,
          baseline: null,
          identity_snapshot: null,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      console.log("🧹 [PersonaSync.reset] Persona neutralized.");
    } catch (err) {
      console.error("⚠️ [PersonaSync.reset] failed:", err);
    }
  }

  /**
   * Traits を平滑化（徐々に変化）
   */
  static merge(
    prev: TraitVector,
    next: TraitVector,
    weight = 0.5
  ): TraitVector {
    return {
      calm: prev.calm * (1 - weight) + next.calm * weight,
      empathy: prev.empathy * (1 - weight) + next.empathy * weight,
      curiosity: prev.curiosity * (1 - weight) + next.curiosity * weight,
    };
  }
}
