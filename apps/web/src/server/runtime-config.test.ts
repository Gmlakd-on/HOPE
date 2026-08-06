import { describe, expect, it } from "vitest";
import {
  resolveDeploymentEnvironment,
  resolveWishRuntimeConfig,
  type WishRuntimeEnvironment,
} from "./runtime-config";

function environment(
  overrides: Partial<WishRuntimeEnvironment> = {},
): WishRuntimeEnvironment {
  return {
    APP_ENV: "development",
    VERCEL_ENV: undefined,
    MODE: "development",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    WISH_HASH_SECRET: "a".repeat(32),
    PUBLIC_TURNSTILE_SITE_KEY: undefined,
    TURNSTILE_SECRET_KEY: undefined,
    TURNSTILE_ALLOWED_HOSTNAMES: undefined,
    ALLOW_INSECURE_TURNSTILE: "true",
    ...overrides,
  };
}

describe("resolveDeploymentEnvironment", () => {
  it("trusts Vercel production and preview over APP_ENV", () => {
    expect(
      resolveDeploymentEnvironment(
        environment({ APP_ENV: "development", VERCEL_ENV: "production" }),
      ),
    ).toBe("production");
    expect(
      resolveDeploymentEnvironment(
        environment({ APP_ENV: "production", VERCEL_ENV: "preview" }),
      ),
    ).toBe("staging");
  });

  it("rejects unknown explicit deployment stages", () => {
    expect(() =>
      resolveDeploymentEnvironment(
        environment({ APP_ENV: "prod", VERCEL_ENV: undefined }),
      ),
    ).toThrow(/APP_ENV must be/);
  });
});

describe("resolveWishRuntimeConfig", () => {
  it("fails immediately in production when the Turnstile secret is missing", () => {
    expect(() =>
      resolveWishRuntimeConfig(
        environment({
          APP_ENV: "production",
          ALLOW_INSECURE_TURNSTILE: undefined,
          PUBLIC_TURNSTILE_SITE_KEY: "site-key",
          TURNSTILE_ALLOWED_HOSTNAMES: "www.hiddenpage.co.kr",
        }),
      ),
    ).toThrow(/TURNSTILE_SECRET_KEY is required/);
  });

  it("never permits insecure verification in staging or production", () => {
    for (const APP_ENV of ["staging", "production"] as const) {
      expect(() => resolveWishRuntimeConfig(environment({ APP_ENV }))).toThrow(
        /cannot be disabled/,
      );
    }
  });

  it("allows explicit verification disable only in development and test", () => {
    for (const APP_ENV of ["development", "test"] as const) {
      const config = resolveWishRuntimeConfig(environment({ APP_ENV }));
      expect(config.turnstile).toEqual({
        mode: "disabled",
        environment: APP_ENV,
      });
    }
  });

  it("requires a site key and hostname allowlist in protected environments", () => {
    expect(() =>
      resolveWishRuntimeConfig(
        environment({
          APP_ENV: "production",
          ALLOW_INSECURE_TURNSTILE: undefined,
          TURNSTILE_SECRET_KEY: "secret",
          TURNSTILE_ALLOWED_HOSTNAMES: "www.hiddenpage.co.kr",
        }),
      ),
    ).toThrow(/PUBLIC_TURNSTILE_SITE_KEY/);

    expect(() =>
      resolveWishRuntimeConfig(
        environment({
          APP_ENV: "production",
          ALLOW_INSECURE_TURNSTILE: undefined,
          TURNSTILE_SECRET_KEY: "secret",
          PUBLIC_TURNSTILE_SITE_KEY: "site-key",
        }),
      ),
    ).toThrow(/TURNSTILE_ALLOWED_HOSTNAMES/);
  });
});
