import { describe, expect, it, vi } from "vitest";
import { TurnstileVerifier, WISH_TURNSTILE_ACTION } from "./turnstile-verifier";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requiredVerifier(
  result: unknown,
  allowedHostnames: readonly string[] = ["www.hiddenpage.co.kr"],
): TurnstileVerifier {
  return new TurnstileVerifier(
    {
      mode: "required",
      secret: "test-secret",
      expectedAction: WISH_TURNSTILE_ACTION,
      allowedHostnames,
    },
    vi.fn().mockResolvedValue(response(result)),
  );
}

describe("TurnstileVerifier", () => {
  it.each(["development", "test"] as const)(
    "allows explicit disable only in %s",
    async (environment) => {
      const verifier = new TurnstileVerifier({ mode: "disabled", environment });
      await expect(verifier.verify(null, null)).resolves.toBe(true);
    },
  );

  it.each([
    ["development", "localhost"],
    ["staging", "staging.hiddenpage.co.kr"],
    ["production", "www.hiddenpage.co.kr"],
  ])("accepts the configured %s hostname", async (_stage, hostname) => {
    const verifier = requiredVerifier(
      { success: true, action: WISH_TURNSTILE_ACTION, hostname },
      [hostname],
    );
    await expect(verifier.verify("token", "203.0.113.1")).resolves.toBe(true);
  });

  it("rejects a token issued for another action", async () => {
    const verifier = requiredVerifier({
      success: true,
      action: "contact_submit",
      hostname: "www.hiddenpage.co.kr",
    });
    await expect(verifier.verify("token", null)).resolves.toBe(false);
  });

  it("rejects a token issued for an unapproved hostname", async () => {
    const verifier = requiredVerifier({
      success: true,
      action: WISH_TURNSTILE_ACTION,
      hostname: "attacker.example",
    });
    await expect(verifier.verify("token", null)).resolves.toBe(false);
  });

  it("rejects failed verification and invalid secrets", async () => {
    const failed = requiredVerifier({
      success: false,
      action: WISH_TURNSTILE_ACTION,
      hostname: "www.hiddenpage.co.kr",
      "error-codes": ["invalid-input-secret"],
    });
    await expect(failed.verify("token", null)).resolves.toBe(false);
  });

  it("rejects network and non-2xx failures", async () => {
    const networkFailure = new TurnstileVerifier(
      {
        mode: "required",
        secret: "secret",
        allowedHostnames: ["www.hiddenpage.co.kr"],
      },
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const httpFailure = new TurnstileVerifier(
      {
        mode: "required",
        secret: "secret",
        allowedHostnames: ["www.hiddenpage.co.kr"],
      },
      vi.fn().mockResolvedValue(response({}, 500)),
    );

    await expect(networkFailure.verify("token", null)).resolves.toBe(false);
    await expect(httpFailure.verify("token", null)).resolves.toBe(false);
  });
});
