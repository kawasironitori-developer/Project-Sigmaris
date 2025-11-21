/**
 * 🧭 シグマリスOS — 課金プラン定義（B仕様：全 API 対応）
 *
 * GuardApiType と完全同期する必要があるため
 * PlanApiType を外部でも使えるよう export している
 */

export type PlanApiType =
  | "aei"
  | "reflect"
  | "identity"
  | "meta"
  | "value"
  | "introspect";

/** 各APIの上限セット */
export interface PlanLimit {
  aei: number | null;
  reflect: number | null;
  identity: number | null;
  meta: number | null;
  value: number | null;
  introspect: number | null;
}

/** プラン定義 */
export interface PlanDefinition {
  name: string;
  price: number; // JPY / 月
  limits: PlanLimit;
  trialDays?: number;
}

/** Free基準のデフォルト（安全な初期値） */
const defaultLimits: PlanLimit = {
  aei: 10,
  reflect: 10,
  identity: 10,
  meta: 10,
  value: 10,
  introspect: 10,
};

/**
 * 💰 プラン一覧（B仕様：6API 全対応）
 * Infinity は Supabase integer カラムに書けないため `null` 扱いに変換
 */
export const plans: Record<string, PlanDefinition> = {
  free: {
    name: "Free",
    price: 0,
    limits: { ...defaultLimits },
    trialDays: 7,
  },

  standard: {
    name: "Standard",
    price: 980,
    limits: {
      aei: 300,
      reflect: 300,
      identity: 200,
      meta: 200,
      value: 200,
      introspect: 200,
    },
  },

  pro: {
    name: "Pro",
    price: 1980,
    limits: {
      aei: 1000,
      reflect: 1000,
      identity: 800,
      meta: 800,
      value: 800,
      introspect: 800,
    },
  },

  unlimited: {
    name: "Unlimited",
    price: 4980,
    limits: {
      aei: null, // null = 無制限扱い
      reflect: null,
      identity: null,
      meta: null,
      value: null,
      introspect: null,
    },
  },
};

/**
 * 🔓 開発者の課金免除
 */
export function isBillingExempt(user: any): boolean {
  if (!user) return false;

  const bypassEmails = ["kaiseif4e@gmail.com", "sigmaris-dev@example.com"];

  return Boolean(user?.is_billing_exempt || bypassEmails.includes(user.email));
}

/**
 * 🧮 プランのAPI上限を取得（GuardApiType と完全同期）
 * Infinity は DB 不整合の原因になるため null = 無制限として扱う
 */
export function getPlanLimit(plan: string, type: PlanApiType): number {
  const target = plans[plan];

  const rawLimit =
    target?.limits?.[type] ?? defaultLimits[type] ?? defaultLimits.aei;

  // 無制限
  if (rawLimit === null) return Infinity;

  // 正常
  return rawLimit;
}
