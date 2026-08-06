import { afterEach, describe, expect, it, vi } from "vitest";
import { WishApiClient } from "./wish-api";

afterEach(() => vi.unstubAllGlobals());

describe("WishApiClient", () => {
  it("returns the approved public feed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: "1", message: "건강하기", locale: "ko" }],
          total: 7,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            etag: 'W/"feed-v1"',
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new WishApiClient("/api/wishes").list();

    expect(result).toEqual({
      items: [{ id: "1", message: "건강하기", locale: "ko" }],
      total: 7,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reuses the cached feed after an ETag 304 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: "1", message: "건강하기", locale: "ko" }],
            total: 7,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: 'W/"feed-v1"',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 304,
          headers: { etag: 'W/"feed-v1"' },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new WishApiClient("/api/wishes");
    const first = await client.list();
    const second = await client.list();

    expect(second).toEqual(first);
    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondRequest.headers).get("if-none-match")).toBe(
      'W/"feed-v1"',
    );
  });

  it("returns a public wish that can be rendered immediately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "wish-id",
            status: "approved",
            publicWish: {
              id: "wish-id",
              message: "건강하게 지내기",
              locale: "ko",
            },
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      new WishApiClient("/api/wishes").submit({
        message: "건강하게 지내기",
        visibility: "public",
        locale: "ko",
        turnstileToken: "token",
      }),
    ).resolves.toEqual({
      id: "wish-id",
      status: "approved",
      publicWish: {
        id: "wish-id",
        message: "건강하게 지내기",
        locale: "ko",
      },
    });
  });

  it("surfaces the server validation message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "잠시 후 다시 시도해 주세요." } }),
          {
            status: 429,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      new WishApiClient("/api/wishes").submit({
        message: "용기를 잃지 않기",
        visibility: "private",
        locale: "ko",
        turnstileToken: null,
      }),
    ).rejects.toThrow("잠시 후 다시 시도해 주세요.");
  });
});
