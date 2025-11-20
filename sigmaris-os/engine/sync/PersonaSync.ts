// /engine/sync/PersonaSync.ts
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { TraitVector } from "@/lib/traits";

export class PersonaSync {
  /**
   * ─────────────────────────────────────────────
   * Persona を Supabase からロード
   * ─────────────────────────────────────────────
   */
  static async load(userId: string): Promise<
    TraitVector & {
      reflection?: string;
      meta_summary?: string;
      growth?: number;
      timestamp?: string;
    }
  > {
    try {
      if (!userId) throw new Error("User ID missing in PersonaSync.load");

      const supabase = getSupabaseServer();

      const { data, error } = await supabase
        .from("persona")
        .select(
          "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      const calm = Number(data?.calm ?? 0.5);
      const empathy = Number(data?.empathy ?? 0.5);
      const curiosity = Number(data?.curiosity ?? 0.5);

      console.log("📥 [PersonaSync.load] OK", {
        calm,
        empathy,
        curiosity,
      });

      return {
        calm,
        empathy,
        curiosity,
        reflection: data?.reflection ?? "",
        meta_summary: data?.meta_summary ?? "",
        growth: Number(data?.growth ?? 0),
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
        growth: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * ─────────────────────────────────────────────
   * Persona を Supabase に保存（Reflection 互換）
   * ─────────────────────────────────────────────
   */
  static async update(
    traits: TraitVector,
    metaSummary?: string,
    growthWeight?: number,
    userId?: string
  ) {
    try {
      if (!userId) throw new Error("User ID missing in PersonaSync.update");

      const supabase = getSupabaseServer();

      // 自動生成する簡易 reflection 文字列
      const reflectionText = `(auto-reflection @ ${new Date().toLocaleTimeString(
        "ja-JP"
      )})`;

      const payload = {
        user_id: userId,
        calm: Number(traits.calm ?? 0.5),
        empathy: Number(traits.empathy ?? 0.5),
        curiosity: Number(traits.curiosity ?? 0.5),
        reflection: reflectionText,
        meta_summary: metaSummary ?? "",
        growth: Number(growthWeight ?? 0),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("persona")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      console.log("☁️ [PersonaSync.update] updated:", {
        calm: payload.calm.toFixed(2),
        empathy: payload.empathy.toFixed(2),
        curiosity: payload.curiosity.toFixed(2),
        meta_summary: (payload.meta_summary ?? "").slice(0, 60) + "...",
        growth: payload.growth.toFixed(3),
      });
    } catch (err) {
      console.error("⚠️ [PersonaSync.update] failed:", err);
    }
  }

  /**
   * ─────────────────────────────────────────────
   * Personaリセット（開発用）
   * ─────────────────────────────────────────────
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
          meta_summary: "Reset state",
          growth: 0,
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
   * ─────────────────────────────────────────────
   * Traits を前回値とマージ
   * ─────────────────────────────────────────────
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
