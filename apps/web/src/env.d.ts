/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_INSTAGRAM_URL?: string;
  readonly PUBLIC_CONTACT_EMAIL?: string;
  readonly PUBLIC_PROJECT_001_URL?: string;
  readonly PUBLIC_COMPANY_FOUNDED_DATE?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly APP_ENV?: string;
  readonly VERCEL_ENV?: string;
  readonly ALLOW_INSECURE_TURNSTILE?: string;
  readonly TURNSTILE_ALLOWED_HOSTNAMES?: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SECRET_KEY?: string;
  readonly WISH_HASH_SECRET?: string;
  readonly TURNSTILE_SECRET_KEY?: string;
  readonly ADMIN_USERNAME?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_SESSION_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  HOPE_LANGUAGE?: "ko" | "en";
  turnstile?: {
    render(container: HTMLElement, options: Record<string, unknown>): string;
    reset(widgetId?: string): void;
  };
}
