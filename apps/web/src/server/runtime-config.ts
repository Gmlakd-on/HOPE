import type { TurnstileVerifierOptions } from "@hope/wishes-infrastructure";

export type DeploymentEnvironment =
  "development" | "test" | "staging" | "production";

export interface WishRuntimeEnvironment {
  readonly APP_ENV: string | undefined;
  readonly VERCEL_ENV: string | undefined;
  readonly MODE: string | undefined;
  readonly SUPABASE_URL: string | undefined;
  readonly SUPABASE_SECRET_KEY: string | undefined;
  readonly WISH_HASH_SECRET: string | undefined;
  readonly PUBLIC_TURNSTILE_SITE_KEY: string | undefined;
  readonly TURNSTILE_SECRET_KEY: string | undefined;
  readonly TURNSTILE_ALLOWED_HOSTNAMES: string | undefined;
  readonly ALLOW_INSECURE_TURNSTILE: string | undefined;
}

export interface WishRuntimeConfig {
  readonly environment: DeploymentEnvironment;
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string;
  readonly hashSecret: string;
  readonly turnstile: TurnstileVerifierOptions;
  readonly rateLimit: {
    readonly maxSubmissions: number;
    readonly windowSeconds: number;
  };
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function resolveDeploymentEnvironment(
  env: WishRuntimeEnvironment,
): DeploymentEnvironment {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "staging";

  const explicit = env.APP_ENV?.trim().toLowerCase();
  if (explicit) {
    if (["development", "test", "staging", "production"].includes(explicit)) {
      return explicit as DeploymentEnvironment;
    }
    throw new Error(
      "APP_ENV must be development, test, staging, or production.",
    );
  }

  if (env.MODE === "test") return "test";
  return "development";
}

function parseAllowedHostnames(value: string | undefined): readonly string[] {
  return (value ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

export function resolveWishRuntimeConfig(
  env: WishRuntimeEnvironment,
): WishRuntimeConfig {
  const environment = resolveDeploymentEnvironment(env);
  const protectedEnvironment =
    environment === "staging" || environment === "production";
  const disableRequested = env.ALLOW_INSECURE_TURNSTILE === "true";
  const secret = env.TURNSTILE_SECRET_KEY?.trim();

  if (protectedEnvironment && disableRequested) {
    throw new Error(`Turnstile cannot be disabled in ${environment}.`);
  }

  let turnstile: TurnstileVerifierOptions;
  if (secret) {
    const allowedHostnames = parseAllowedHostnames(
      env.TURNSTILE_ALLOWED_HOSTNAMES,
    );
    if (allowedHostnames.length === 0) {
      throw new Error(
        "TURNSTILE_ALLOWED_HOSTNAMES is required when Turnstile verification is enabled.",
      );
    }
    if (protectedEnvironment)
      required(env.PUBLIC_TURNSTILE_SITE_KEY, "PUBLIC_TURNSTILE_SITE_KEY");
    turnstile = {
      mode: "required",
      secret,
      expectedAction: "wish_submit",
      allowedHostnames,
    };
  } else {
    if (!disableRequested) {
      throw new Error(
        "TURNSTILE_SECRET_KEY is required. Set ALLOW_INSECURE_TURNSTILE=true only for development or test.",
      );
    }
    if (environment !== "development" && environment !== "test") {
      throw new Error(`Turnstile cannot be disabled in ${environment}.`);
    }
    turnstile = { mode: "disabled", environment };
  }

  return {
    environment,
    supabaseUrl: required(env.SUPABASE_URL, "SUPABASE_URL"),
    supabaseSecretKey: required(env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY"),
    hashSecret: required(env.WISH_HASH_SECRET, "WISH_HASH_SECRET"),
    turnstile,
    rateLimit: { maxSubmissions: 2, windowSeconds: 60 },
  };
}
