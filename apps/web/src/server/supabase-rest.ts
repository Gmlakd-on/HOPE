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

export function supabaseHeaders(
  config: SupabaseRestConfig,
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("apikey", config.secretKey);
  headers.set("authorization", `Bearer ${config.secretKey}`);
  return headers;
}

export function supabaseRestUrl(
  config: SupabaseRestConfig,
  table: string,
): URL {
  return new URL(`/rest/v1/${table}`, `${config.url}/`);
}

export async function readSupabaseError(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    return [payload.message, payload.details, payload.hint, payload.code]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
      .join(" | ") || fallback;
  } catch {
    return fallback;
  }
}
