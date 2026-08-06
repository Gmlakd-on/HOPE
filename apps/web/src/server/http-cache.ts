import { createHash } from "node:crypto";

const DEFAULT_BROWSER_MAX_AGE_SECONDS = 0;
const DEFAULT_SHARED_MAX_AGE_SECONDS = 30;
const DEFAULT_STALE_WHILE_REVALIDATE_SECONDS = 120;

export interface PublicJsonCacheOptions {
  readonly browserMaxAgeSeconds?: number;
  readonly sharedMaxAgeSeconds?: number;
  readonly staleWhileRevalidateSeconds?: number;
  readonly additionalHeaders?: HeadersInit;
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value ?? fallback));
}

function cacheControl(options: PublicJsonCacheOptions): string {
  const browserMaxAge = nonNegativeInteger(
    options.browserMaxAgeSeconds,
    DEFAULT_BROWSER_MAX_AGE_SECONDS,
  );
  const sharedMaxAge = nonNegativeInteger(
    options.sharedMaxAgeSeconds,
    DEFAULT_SHARED_MAX_AGE_SECONDS,
  );
  const staleWhileRevalidate = nonNegativeInteger(
    options.staleWhileRevalidateSeconds,
    DEFAULT_STALE_WHILE_REVALIDATE_SECONDS,
  );

  return [
    "public",
    `max-age=${browserMaxAge}`,
    `s-maxage=${sharedMaxAge}`,
    `stale-while-revalidate=${staleWhileRevalidate}`,
  ].join(", ");
}

function entityTag(serializedBody: string): string {
  const digest = createHash("sha256").update(serializedBody).digest("base64url");
  return `W/"${digest}"`;
}

function normalizeEntityTag(value: string): string {
  return value.trim().replace(/^W\//i, "");
}

function requestMatchesEntityTag(request: Request, etag: string): boolean {
  const raw = request.headers.get("if-none-match");
  if (!raw) return false;

  const expected = normalizeEntityTag(etag);
  return raw
    .split(",")
    .map(normalizeEntityTag)
    .some((candidate) => candidate === "*" || candidate === expected);
}

export function publicJsonResponse(
  request: Request,
  body: unknown,
  options: PublicJsonCacheOptions = {},
): Response {
  const serializedBody = JSON.stringify(body);
  const etag = entityTag(serializedBody);
  const headers = new Headers(options.additionalHeaders);
  headers.set("cache-control", cacheControl(options));
  headers.set("etag", etag);
  headers.set("vary", "accept-encoding");
  headers.set("x-content-type-options", "nosniff");

  if (requestMatchesEntityTag(request, etag)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(serializedBody, { status: 200, headers });
}
