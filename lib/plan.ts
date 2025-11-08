// /lib/plan.ts
"use server";

/**
 * 🧭 シグマリスOS — 課金プラン定義と開発者免除
 * 各APIで import { plans, isBillingExempt, getPlanLimit } from "@/lib/plan";
 */

export interface PlanLimit {
  aei: number; // /api/aei の上限
  reflect: number; // /api/reflect の上限
}

export interface PlanDefinition {
  name: string;
  price: number; // 月額 (JPY)
  limits: PlanLimit;
  trialDays?: number;
}

export const plans: Record<string, PlanDefinition> = {
  free: {
    name: "Free",
    price: 0,
    limits: { aei: 10, reflect: 10 },
    trialDays: 7,
  },
  standard: {
    name: "Standard",
    price: 980,
    limits: { aei: 300, reflect: 300 },
  },
  pro: {
    name: "Pro",
    price: 1980,
    limits: { aei: 1000, reflect: 1000 },
  },
};

/**
 * 🔓 開発者・特定ユーザーの課金免除判定
 * Supabase側の is_billing_exempt=true or メールアドレス指定
 */
export function isBillingExempt(user: any): boolean {
  if (!user) return false;
  const bypassEmails = [
    "kaiseif4e@gmail.com", // ← 開発者
    "sigmaris-dev@example.com", // ← 追加テスター
  ];
  return !!user?.is_billing_exempt || bypassEmails.includes(user.email);
}

/**
 * 🧮 プラン上限を取得
 */
export function getPlanLimit(plan: string, type: "aei" | "reflect"): number {
  return plans[plan]?.limits?.[type] ?? plans.free.limits[type];
}
