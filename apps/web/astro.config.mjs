import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

function deploymentStage(env) {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "staging";

  const explicit = env.APP_ENV?.trim().toLowerCase();
  if (!explicit) return "development";
  if (
    ["development", "test", "staging", "production"].includes(explicit)
  ) {
    return explicit;
  }

  throw new Error(
    "APP_ENV must be development, test, staging, or production.",
  );
}

function validateProtectedDeploymentEnvironment(env) {
  const stage = deploymentStage(env);
  if (stage !== "production" && stage !== "staging") return;

  const required = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "WISH_HASH_SECRET",
    "PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_ALLOWED_HOSTNAMES",
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (env.ALLOW_INSECURE_TURNSTILE === "true") {
    throw new Error(`Turnstile cannot be disabled in ${stage}.`);
  }
  if (missing.length) {
    throw new Error(
      `Missing required ${stage} environment variables: ${missing.join(", ")}`,
    );
  }
}

validateProtectedDeploymentEnvironment(process.env);

export default defineConfig({
  output: "server",
  adapter: vercel(),
  compressHTML: true,
  build: { inlineStylesheets: "auto" },
  vite: {
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  },
});
