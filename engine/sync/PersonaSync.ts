// /engine/sync/PersonaSync.ts
import { supabaseServer } from "@/lib/supabaseServer";
import { TraitVector } from "@/lib/traits";

/**
 * PersonaSync v3.0（Cloud Edition）
 * - Supabase の persona テーブルと同期
 * - ReflectionEngine / MetaReflectionEngine と連携
 * - SafetyLayer適用後の人格値＋メタ内省を永続化
 * - 旧SQLite I/Oを廃止（loadPersona/savePersona 不要）
 */
export class PersonaSync {
  /**
   * 最新の人格情報をロード（Supabase → メモリ）
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
      const { data, error } = await supabaseServer
        .from("persona")
        .select(
          "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return {
        calm: data?.calm ?? 0.5,
        empathy: data?.empathy ?? 0.5,
        curiosity: data?.curiosity ?? 0.5,
        reflection: data?.reflection ?? "",
        meta_summary: data?.meta_summary ?? "",
        growth: data?.growth ?? 0,
        timestamp: data?.updated_at ?? new Date().toISOString(),
      };
    } catch (err) {
      console.error("⚠️ PersonaSync.load failed:", err);
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
   * 人格データを保存（Reflection / MetaReflection 統合）
   * @param traits 現在のTraitベクトル
   * @param metaSummary 最新のメタ内省（人格傾向）
   * @param growthWeight 学習重み
   */
  static async update(
    traits: TraitVector,
    metaSummary?: string,
    growthWeight?: number
  ) {
    try {
      // ユーザー情報を取得
      const {
        data: { user },
        error: userError,
      } = await supabaseServer.auth.getUser();

      if (userError || !user) throw new Error("No user found");

      const reflectionText =
        "(auto-reflection updated at " +
        new Date().toLocaleTimeString("ja-JP") +
        ")";

      // Supabase に upsert
      const { error: dbError } = await supabaseServer.from("persona").upsert(
        {
          user_id: user.id,
          calm: traits.calm,
          empathy: traits.empathy,
          curiosity: traits.curiosity,
          reflection: reflectionText,
          meta_summary: metaSummary ?? "",
          growth: growthWeight ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (dbError) throw dbError;

      console.log("☁️ PersonaSync (Supabase): persona updated", {
        calm: traits.calm.toFixed(2),
        empathy: traits.empathy.toFixed(2),
        curiosity: traits.curiosity.toFixed(2),
        metaSummary: metaSummary?.slice(0, 80) ?? "(none)",
        growthWeight,
      });
    } catch (err) {
      console.error("⚠️ PersonaSync.update failed:", err);
    }
  }

  /**
   * Personaの初期化（開発・テスト用）
   */
  static async reset() {
    try {
      const {
        data: { user },
      } = await supabaseServer.auth.getUser();
      if (!user) throw new Error("No user found");

      await supabaseServer.from("persona").upsert(
        {
          user_id: user.id,
          calm: 0.5,
          empathy: 0.5,
          curiosity: 0.5,
          reflection: "",
          meta_summary: "Reset state",
          growth: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      console.log("🧹 PersonaSync: persona reset to neutral state (Supabase).");
    } catch (err) {
      console.error("⚠️ PersonaSync.reset failed:", err);
    }
  }

  /**
   * Persona値のマージ（前回値と現在値の平均）
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
