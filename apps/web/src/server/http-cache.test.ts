import { describe, expect, it } from "vitest";
import { publicJsonResponse } from "./http-cache";

const URL = "https://hope.ai.kr/api/example";

describe("publicJsonResponse", () => {
  it("returns deterministic JSON cache headers and an ETag", async () => {
    const response = publicJsonResponse(
      new Request(URL),
      { items: [{ id: "1" }], total: 1 },
      {
        sharedMaxAgeSeconds: 60,
        staleWhileRevalidateSeconds: 300,
        additionalHeaders: { "x-test-header": "present" },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("etag")).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect(response.headers.get("vary")).toBe("accept-encoding");
    expect(response.headers.get("x-test-header")).toBe("present");
    await expect(response.json()).resolves.toEqual({
      items: [{ id: "1" }],
      total: 1,
    });
  });

  it("accepts weak or strong validators in a comma-separated list", () => {
    const body = { value: "same representation" };
    const first = publicJsonResponse(new Request(URL), body);
    const weakEtag = first.headers.get("etag");
    expect(weakEtag).toBeTruthy();

    const strongEtag = weakEtag?.replace(/^W\//, "") ?? "";
    const response = publicJsonResponse(
      new Request(URL, {
        headers: { "if-none-match": `"other", ${strongEtag}` },
      }),
      body,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(weakEtag);
  });

  it("treats If-None-Match star as a cache hit", async () => {
    const response = publicJsonResponse(
      new Request(URL, { headers: { "if-none-match": "*" } }),
      { value: 1 },
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("clamps negative cache durations and falls back for non-finite values", () => {
    const response = publicJsonResponse(new Request(URL), null, {
      browserMaxAgeSeconds: -10,
      sharedMaxAgeSeconds: Number.POSITIVE_INFINITY,
      staleWhileRevalidateSeconds: -1,
    });

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=30, stale-while-revalidate=0",
    );
  });
});
