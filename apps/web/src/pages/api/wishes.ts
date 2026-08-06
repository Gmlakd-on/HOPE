import type { APIRoute } from "astro";
import { createWishServices } from "../../server/wish-services";
import {
  handleGetWishes,
  handlePostWishes,
  json,
} from "../../server/wishes-handler";

export const prerender = false;

function runtimeEnvironment() {
  return {
    APP_ENV: import.meta.env.APP_ENV,
    VERCEL_ENV: import.meta.env.VERCEL_ENV,
    MODE: import.meta.env.MODE,
    SUPABASE_URL: import.meta.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: import.meta.env.SUPABASE_SECRET_KEY,
    WISH_HASH_SECRET: import.meta.env.WISH_HASH_SECRET,
    PUBLIC_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: import.meta.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_ALLOWED_HOSTNAMES: import.meta.env.TURNSTILE_ALLOWED_HOSTNAMES,
    ALLOW_INSECURE_TURNSTILE: import.meta.env.ALLOW_INSECURE_TURNSTILE,
  };
}

export const GET: APIRoute = async ({ request }) => {
  try {
    return await handleGetWishes(
      request,
      createWishServices(runtimeEnvironment()),
    );
  } catch (error) {
    console.error("GET /api/wishes configuration failed", error);
    return json(
      {
        error: {
          code: "CONFIGURATION_ERROR",
          message: "서비스 설정이 올바르지 않습니다.",
        },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    return await handlePostWishes(
      request,
      createWishServices(runtimeEnvironment()),
    );
  } catch (error) {
    console.error("POST /api/wishes configuration failed", error);
    return json(
      {
        error: {
          code: "CONFIGURATION_ERROR",
          message: "서비스 설정이 올바르지 않습니다.",
        },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
};
