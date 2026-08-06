import type { Language } from "./i18n";

export interface PublicWishDto {
  id: string;
  message: string;
  locale: Language;
}

export interface WishFeedDto {
  items: readonly PublicWishDto[];
  total: number;
}

export interface SubmitWishPayload {
  message: string;
  visibility: "public" | "private";
  locale: Language;
  turnstileToken: string | null;
}

export interface SubmitWishResult {
  id: string;
  status: "pending" | "approved" | "rejected";
  publicWish: PublicWishDto | null;
}

function isPublicWish(value: unknown): value is PublicWishDto {
  if (!value || typeof value !== "object") return false;
  const wish = value as Record<string, unknown>;
  return (
    typeof wish.id === "string" &&
    typeof wish.message === "string" &&
    (wish.locale === "ko" || wish.locale === "en")
  );
}

function normalizeFeed(value: unknown): WishFeedDto {
  if (!value || typeof value !== "object") {
    throw new Error("소원 목록 응답이 올바르지 않습니다.");
  }

  const body = value as Record<string, unknown>;
  const items = Array.isArray(body.items)
    ? body.items.filter(isPublicWish)
    : [];
  const rawTotal = body.total;
  const total =
    typeof rawTotal === "number" && Number.isFinite(rawTotal)
      ? Math.max(0, Math.trunc(rawTotal))
      : items.length;

  return { items, total: Math.max(total, items.length) };
}

export class WishApiClient {
  private cachedFeed: WishFeedDto | null = null;
  private feedEtag: string | null = null;

  constructor(private readonly endpoint: string) {}

  async list(signal?: AbortSignal): Promise<WishFeedDto> {
    return this.requestFeed(signal, true);
  }

  private async requestFeed(
    signal: AbortSignal | undefined,
    includeValidator: boolean,
  ): Promise<WishFeedDto> {
    const headers = new Headers({ accept: "application/json" });
    if (includeValidator && this.feedEtag) {
      headers.set("if-none-match", this.feedEtag);
    }

    const init: RequestInit = {
      cache: "default",
      headers,
    };
    if (signal) init.signal = signal;

    const response = await fetch(this.endpoint, init);
    if (response.status === 304) {
      if (this.cachedFeed) return this.cachedFeed;

      this.feedEtag = null;
      if (includeValidator) return this.requestFeed(signal, false);
      throw new Error(`GET ${this.endpoint}: unexpected 304 response`);
    }
    if (!response.ok) {
      throw new Error(`GET ${this.endpoint}: ${response.status}`);
    }

    const feed = normalizeFeed(await response.json());
    this.cachedFeed = feed;
    this.feedEtag = response.headers.get("etag");
    return feed;
  }

  async submit(payload: SubmitWishPayload): Promise<SubmitWishResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => null)) as
      | {
          id?: string;
          status?: "pending" | "approved" | "rejected";
          publicWish?: PublicWishDto | null;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      throw new Error(
        body?.error?.message ?? `POST ${this.endpoint}: ${response.status}`,
      );
    }

    if (!body?.id || !body.status) {
      throw new Error("소원 저장 응답이 올바르지 않습니다.");
    }

    const publicWish = isPublicWish(body.publicWish) ? body.publicWish : null;
    if (publicWish) {
      const previous = this.cachedFeed;
      this.cachedFeed = {
        items: [
          publicWish,
          ...(previous?.items.filter((wish) => wish.id !== publicWish.id) ?? []),
        ],
        total: Math.max((previous?.total ?? 0) + 1, 1),
      };
      this.feedEtag = null;
    }

    return {
      id: body.id,
      status: body.status,
      publicWish,
    };
  }
}
