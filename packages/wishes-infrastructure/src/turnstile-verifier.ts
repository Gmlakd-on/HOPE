import type { HumanVerifier } from "@hope/wishes-domain";

export const WISH_TURNSTILE_ACTION = "wish_submit";

const TURNSTILE_VERIFY_TIMEOUT_MS = 10_000;

export type InsecureTurnstileEnvironment = "development" | "test";

export type TurnstileVerifierOptions =
  | {
      readonly mode: "required";
      readonly secret: string;
      readonly expectedAction?: string;
      readonly allowedHostnames: readonly string[];
    }
  | {
      readonly mode: "disabled";
      readonly environment: InsecureTurnstileEnvironment;
    };

interface TurnstileResponse {
  readonly success?: boolean;
  readonly action?: string;
  readonly hostname?: string;
  readonly "error-codes"?: readonly string[];
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isAllowedHostname(
  hostname: string,
  allowedHostnames: ReadonlySet<string>,
): boolean {
  for (const allowed of allowedHostnames) {
    if (hostname === allowed || hostname.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function getErrorDetails(error: unknown): {
  readonly name: string;
  readonly message: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export class TurnstileVerifier implements HumanVerifier {
  private readonly allowedHostnames: ReadonlySet<string>;

  constructor(
    private readonly options: TurnstileVerifierOptions,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (options.mode === "required") {
      if (!options.secret.trim()) {
        throw new Error(
          "TURNSTILE_SECRET_KEY is required when verification is enabled.",
        );
      }

      if (options.allowedHostnames.length === 0) {
        throw new Error(
          "TURNSTILE_ALLOWED_HOSTNAMES must contain at least one hostname.",
        );
      }

      this.allowedHostnames = new Set(
        options.allowedHostnames.map(normalizeHostname).filter(Boolean),
      );

      if (this.allowedHostnames.size === 0) {
        throw new Error(
          "TURNSTILE_ALLOWED_HOSTNAMES must contain at least one valid hostname.",
        );
      }
    } else {
      this.allowedHostnames = new Set();
    }
  }

  async verify(
    token: string | null,
    remoteIp: string | null,
  ): Promise<boolean> {
    if (this.options.mode === "disabled") return true;

    if (!token) {
      console.warn("Turnstile verification rejected: missing token.");
      return false;
    }

    const body = new URLSearchParams({
      secret: this.options.secret,
      response: token,
    });

    if (remoteIp) body.set("remoteip", remoteIp);

    try {
      const response = await this.fetcher(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body,
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        console.error("Turnstile verification HTTP failure.", {
          status: response.status,
          statusText: response.statusText,
        });

        return false;
      }

      const result = (await response.json()) as TurnstileResponse;

      const expectedAction =
        this.options.expectedAction ?? WISH_TURNSTILE_ACTION;

      const hostname =
        typeof result.hostname === "string"
          ? normalizeHostname(result.hostname)
          : "";

      if (result.success !== true) {
        console.warn("Turnstile verification rejected by Cloudflare.", {
          errorCodes: result["error-codes"] ?? [],
          action: result.action ?? null,
          hostname: hostname || null,
        });

        return false;
      }

      if (result.action !== expectedAction) {
        console.warn("Turnstile verification rejected: action mismatch.", {
          expectedAction,
          receivedAction: result.action ?? null,
        });

        return false;
      }

      if (!isAllowedHostname(hostname, this.allowedHostnames)) {
        console.warn("Turnstile verification rejected: hostname mismatch.", {
          receivedHostname: hostname || null,
          allowedHostnames: [...this.allowedHostnames],
        });

        return false;
      }

      return true;
    } catch (error) {
      const details = getErrorDetails(error);

      console.error("Turnstile verification request failed.", {
        type:
          details.name === "TimeoutError"
            ? "timeout"
            : "network-or-response-error",
        timeoutMs: TURNSTILE_VERIFY_TIMEOUT_MS,
        errorName: details.name,
        errorMessage: details.message,
      });

      return false;
    }
  }
}