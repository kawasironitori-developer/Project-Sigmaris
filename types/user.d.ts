// /types/user.d.ts
import "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  export interface User {
    stripe_customer_id?: string | null;
    plan?: string | null;
    trial_end?: string | null;
  }
}
