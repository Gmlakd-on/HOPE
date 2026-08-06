import { describe, expect, it, vi } from "vitest";
import type { WishServices } from "./wishes-handler";
import {
  handleGetWishes,
  handlePostWishes,
  MAX_REQUEST_BYTES,
  readJsonBody,
} from "./wishes-handler";

function services(): WishServices {
  return {
    list: { execute: vi.fn().mockResolvedValue([]) },
    count: { execute: vi.fn().mockResolvedValue(12) },
    submit: {
      execute: vi.fn().mockResolvedValue({
        id: "wish-id",
        message: "오늘도 다정하게 살고 싶어요.",
        visibility: "public",
        status: "approved",
        locale: "ko",
        createdAt: "2026-07-19T00:00:00.000Z",
        approvedAt: "2026-07-19T00:00:00.000Z",
      }),
    },
  };
}

function jsonRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://www.hiddenpage.co.kr/api/wishes", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function responseCode(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as { error?: { code?: string } };
  return payload.error?.code;
}

describe("actual request body limits", () => {
  it("blocks an oversized body without Content-Length", async () => {
    const request = jsonRequest(
      JSON.stringify({ message: "가".repeat(MAX_REQUEST_BYTES) }),
    );
    const response = await handlePostWishes(request, services());
    expect(response.status).toBe(413);
    await expect(responseCode(response)).resolves.toBe("PAYLOAD_TOO_LARGE");
  });

  it("blocks an oversized body even when Content-Length lies", async () => {
    const request = jsonRequest(
      JSON.stringify({ message: "가".repeat(MAX_REQUEST_BYTES) }),
      { "content-length": "1" },
    );
    const response = await handlePostWishes(request, services());
    expect(response.status).toBe(413);
    await expect(responseCode(response)).resolves.toBe("PAYLOAD_TOO_LARGE");
  });

  it("accepts a normal-size Korean UTF-8 JSON body", async () => {
    const body = JSON.stringify({
      message: "오늘도 서로에게 다정한 사람이 되고 싶어요.",
      visibility: "public",
      locale: "ko",
      turnstileToken: "token",
    });
    const parsed = await readJsonBody(jsonRequest(body));
    expect(parsed.message).toBe("오늘도 서로에게 다정한 사람이 되고 싶어요.");
  });

  it("returns the public wish for immediate bubble rendering", async () => {
    const response = await handlePostWishes(
      jsonRequest(
        JSON.stringify({
          message: "오늘도 다정하게 살고 싶어요.",
          visibility: "public",
          locale: "ko",
          turnstileToken: "token",
        }),
        { "x-forwarded-for": "203.0.113.10" },
      ),
      services(),
    );
    const body = (await response.json()) as {
      publicWish: { id: string; message: string; locale: string } | null;
    };

    expect(response.status).toBe(201);
    expect(body.publicWish).toEqual({
      id: "wish-id",
      message: "오늘도 다정하게 살고 싶어요.",
      locale: "ko",
    });
  });

  it("distinguishes malformed JSON from validation failures", async () => {
    const response = await handlePostWishes(
      jsonRequest("{not-json"),
      services(),
    );
    expect(response.status).toBe(400);
    await expect(responseCode(response)).resolves.toBe("INVALID_JSON");
  });
});

describe("GET limit validation", () => {
  it.each(["abc", "Infinity", "1.5", "0", "51", "-1"])(
    "returns 400 for limit=%s",
    async (limit) => {
      const service = services();
      const response = await handleGetWishes(
        new Request(
          `https://www.hiddenpage.co.kr/api/wishes?limit=${encodeURIComponent(limit)}`,
        ),
        service,
      );
      expect(response.status).toBe(400);
      await expect(responseCode(response)).resolves.toBe("INVALID_LIMIT");
      expect(service.list.execute).not.toHaveBeenCalled();
    },
  );

  it("returns cacheable feed metadata and an entity tag", async () => {
    const service = services();
    const response = await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes"),
      service,
    );
    const body = (await response.json()) as { total: number };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(response.headers.get("cache-control")).toContain(
      "stale-while-revalidate=120",
    );
    expect(response.headers.get("etag")).toMatch(/^W\/.+/);
    expect(body.total).toBe(12);
    expect(service.count.execute).toHaveBeenCalledOnce();
  });

  it("returns 304 when If-None-Match matches the current feed", async () => {
    const first = await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes"),
      services(),
    );
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes", {
        headers: { "if-none-match": etag ?? "" },
      }),
      services(),
    );

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("uses the documented default and boundaries", async () => {
    const service = services();
    await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes"),
      service,
    );
    await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes?limit=1"),
      service,
    );
    await handleGetWishes(
      new Request("https://www.hiddenpage.co.kr/api/wishes?limit=50"),
      service,
    );
    expect(service.list.execute).toHaveBeenNthCalledWith(1, 24);
    expect(service.list.execute).toHaveBeenNthCalledWith(2, 1);
    expect(service.list.execute).toHaveBeenNthCalledWith(3, 50);
  });
});
