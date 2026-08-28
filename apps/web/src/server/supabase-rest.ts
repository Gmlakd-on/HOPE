export interface SupabaseEnvironment {
  readonly SUPABASE_URL: string | undefined;
  readonly SUPABASE_SECRET_KEY: string | undefined;
}

export interface SupabaseRestConfig {
  readonly url: string;
  readonly secretKey: string;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function resolveSupabaseRestConfig(
  environment: SupabaseEnvironment,
): SupabaseRestConfig {
  return {
    url: required(environment.SUPABASE_URL, "SUPABASE_URL").replace(/\/$/, ""),
    secretKey: required(environment.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY"),
  };
}

function looksLikeLegacyJwt(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function supabaseHeaders(
  config: SupabaseRestConfig,
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", config.secretKey);

  // Supabase's current sb_secret_* keys are opaque API keys, not JWTs.
  // Sending them as Authorization: Bearer makes PostgREST try to validate an
  // API key as a JWT. Legacy service_role keys are JWTs and still need the
  // bearer header for direct REST calls.
  if (looksLikeLegacyJwt(config.secretKey)) {
    headers.set("authorization", `Bearer ${config.secretKey}`);
  } else {
    headers.delete("authorization");
  }

  return headers;
}

export function supabaseRestUrl(
  config: SupabaseRestConfig,
  table: string,
): URL {
  return new URL(`/rest/v1/${table}`, `${config.url}/`);
}

interface SupabaseErrorPayload {
  readonly message?: unknown;
  readonly details?: unknown;
  readonly hint?: unknown;
  readonly code?: unknown;
}

async function parseSupabaseError(
  response: Response,
): Promise<SupabaseErrorPayload | null> {
  try {
    return (await response.json()) as SupabaseErrorPayload;
  } catch {
    return null;
  }
}

function isFutureJwtError(payload: SupabaseErrorPayload | null): boolean {
  return (
    payload?.code === "PGRST303" &&
    typeof payload.message === "string" &&
    payload.message.toLowerCase().includes("jwt issued at future")
  );
}

const JWT_CLOCK_SKEW_RETRY_DELAY_MS = 1_500;

export async function fetchSupabase(
  input: URL | string,
  init: RequestInit = {},
): Promise<Response> {
  const firstResponse = await fetch(input, init);
  if (firstResponse.status !== 401) return firstResponse;

  const payload = await parseSupabaseError(firstResponse.clone());
  if (!isFutureJwtError(payload)) return firstResponse;

  // Supabase has had intermittent PostgREST/API-gateway clock-skew incidents
  // where a freshly minted internal JWT is briefly considered "from future".
  // A single bounded retry prevents a transient platform skew from forcing the
  // application onto fallback data. We never loop indefinitely.
  await new Promise((resolve) => setTimeout(resolve, JWT_CLOCK_SKEW_RETRY_DELAY_MS));
  return fetch(input, init);
}

export async function readSupabaseError(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const payload = await parseSupabaseError(response);
  if (!payload) return fallback;

  return (
    [payload.message, payload.details, payload.hint, payload.code]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
      .join(" | ") || fallback
  );
}
