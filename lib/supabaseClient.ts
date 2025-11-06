// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// --- 環境変数から読み取る（安全対策） ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// --- クライアント作成 ---
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
