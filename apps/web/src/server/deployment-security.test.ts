import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface VercelConfig {
  headers?: Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
}

describe("deployment security configuration", () => {
  it("keeps required security headers in the deployed Vercel config", async () => {
    const file = new URL("../../vercel.json", import.meta.url);
    const config = JSON.parse(await readFile(file, "utf8")) as VercelConfig;
    const global = config.headers?.find((entry) => entry.source === "/(.*)");
    const headers = new Map(
      global?.headers.map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers.get("strict-transport-security")).toContain(
      "includeSubDomains",
    );
    expect(headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("permissions-policy")).toContain("geolocation=()");
  });
});
