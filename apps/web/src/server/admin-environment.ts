import type { AdminEnvironment } from "./admin-auth";
import type { SupabaseEnvironment } from "./supabase-rest";

export interface AdminApplicationEnvironment
  extends AdminEnvironment,
    SupabaseEnvironment {}

export function adminEnvironment(): AdminApplicationEnvironment {
  return {
    ADMIN_USERNAME: import.meta.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: import.meta.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: import.meta.env.ADMIN_SESSION_SECRET,
    SUPABASE_URL: import.meta.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: import.meta.env.SUPABASE_SECRET_KEY,
  };
}
