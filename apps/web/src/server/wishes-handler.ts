import { DomainError } from "@hope/wishes-domain";
import type { ListApprovedWishes, SubmitWish } from "@hope/wishes-domain";
import { publicJsonResponse } from "./http-cache";

export const MAX_REQUEST_BYTES = 8_192;
export const DEFAULT_WISH_LIMIT = 24;
export const MIN_WISH_LIMIT = 1;
export const MAX_WISH_LIMIT = 50;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

export interface WishServices {
  readonly list: Pick<ListApprovedWishes, "execute">;
  readonly count: { readonly execute: () => Promise<number> };
  readonly submit: Pick<SubmitWish, "execute">;
}

class RequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(JSON_HEADERS))
    headers.set(key, value);
  return new Response(JSON.stringify(body), { ...init, headers });
}

function noStoreError(error: RequestError | DomainError): Response {
  return json(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { "cache-control": "no-store" } },
  );
}

function getRemoteIp(request: Request): string | null {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || request.headers.get("x-real-ip") || null;
}

export function parseWishLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null || raw === "") return DEFAULT_WISH_LIMIT;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new RequestError("INVALID_LIMIT", 400, "limit은 정수여야 합니다.");
  }
  if (parsed < MIN_WISH_LIMIT || parsed > MAX_WISH_LIMIT) {
    throw new RequestError(
      "INVALID_LIMIT",
      400,
      `limit은 ${MIN_WISH_LIMIT} 이상 ${MAX_WISH_LIMIT} 이하여야 합니다.`,
    );
  }
  return parsed;
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestError(
      "UNSUPPORTED_MEDIA_TYPE",
      415,
      "JSON 요청만 지원합니다.",
    );
  }

  const text = await request.text();
  const actualBytes = new TextEncoder().encode(text).byteLength;
  if (actualBytes > MAX_REQUEST_BYTES) {
    throw new RequestError("PAYLOAD_TOO_LARGE", 413, "요청이 너무 큽니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RequestError(
      "INVALID_JSON",
      400,
      "JSON 형식이 올바르지 않습니다.",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestError("INVALID_JSON", 400, "JSON 객체를 전송해 주세요.");
  }
  return parsed as Record<string, unknown>;
}

export async function handleGetWishes(
  request: Request,
  services: WishServices,
): Promise<Response> {
  try {
    const limit = parseWishLimit(new URL(request.url));
    const [items, total] = await Promise.all([
      services.list.execute(limit),
      services.count.execute(),
    ]);

    return publicJsonResponse(request, { items, total }, {
      sharedMaxAgeSeconds: 30,
      staleWhileRevalidateSeconds: 120,
    });
  } catch (error) {
    if (error instanceof RequestError) return noStoreError(error);
    console.error("GET /api/wishes failed", error);
    return json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "소원 목록을 불러오지 못했습니다.",
        },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function handlePostWishes(
  request: Request,
  services: WishServices,
): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (body.visibility !== "public" && body.visibility !== "private") {
      throw new RequestError(
        "INVALID_VISIBILITY",
        400,
        "공개 설정이 올바르지 않습니다.",
      );
    }
    if (body.locale !== "ko" && body.locale !== "en") {
      throw new RequestError(
        "INVALID_LOCALE",
        400,
        "언어 설정이 올바르지 않습니다.",
      );
    }

    const wish = await services.submit.execute({
      message: typeof body.message === "string" ? body.message : "",
      visibility: body.visibility,
      locale: body.locale,
      turnstileToken:
        typeof body.turnstileToken === "string" ? body.turnstileToken : null,
      remoteIp: getRemoteIp(request),
    });

    const publicWish =
      wish.visibility === "public" && wish.status === "approved"
        ? { id: wish.id, message: wish.message, locale: wish.locale }
        : null;

    return json(
      { id: wish.id, status: wish.status, publicWish },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestError || error instanceof DomainError)
      return noStoreError(error);
    console.error("POST /api/wishes failed", error);
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "소원을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
