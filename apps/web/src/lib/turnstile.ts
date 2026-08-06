let loader: Promise<void> | null = null;

const TURNSTILE_SCRIPT_ID = "hope-turnstile-script";
const TURNSTILE_LOAD_TIMEOUT_MS = 12_000;
const TURNSTILE_TOKEN_TIMEOUT_MS = 30_000;

type TurnstileFailure =
  | "SCRIPT_LOAD_FAILED"
  | "CONFIGURATION_ERROR"
  | "CHALLENGE_TIMEOUT";

export class TurnstileClientError extends Error {
  constructor(
    readonly code: TurnstileFailure,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "TurnstileClientError";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function invalidSiteKeyDetail(siteKey: string): string | null {
  const value = siteKey.trim();
  if (!value) return "MISSING_SITE_KEY";
  if (/^https?:\/\//i.test(value)) return "SITE_KEY_IS_URL";
  if (/[\s/]/.test(value)) return "INVALID_SITE_KEY_VALUE";
  return null;
}

function isLocalEnvironment(): boolean {
  const { hostname, protocol } = window.location;
  return (
    protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function loadTurnstileScriptOnce(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    document.getElementById(TURNSTILE_SCRIPT_ID)?.remove();

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;

    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);

      if (error) {
        script.remove();
        loader = null;
        reject(error);
        return;
      }
      resolve();
    };

    const handleLoad = (): void => {
      if (window.turnstile) finish();
      else finish(new Error("Turnstile API unavailable"));
    };
    const handleError = (): void =>
      finish(new Error("Turnstile script failed to load"));
    const timeoutId = window.setTimeout(
      () => finish(new Error("Turnstile script load timed out")),
      TURNSTILE_LOAD_TIMEOUT_MS,
    );

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return loader;
}

async function loadTurnstileScript(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await loadTurnstileScriptOnce();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(450);
    }
  }
  throw new TurnstileClientError(
    "SCRIPT_LOAD_FAILED",
    lastError instanceof Error ? lastError.message : undefined,
  );
}

interface TokenWaiter {
  resolve: (token: string) => void;
  reject: (error: TurnstileClientError) => void;
  timeoutId: number;
}

export class LazyTurnstile {
  private token: string | null = null;
  private widgetId: string | null = null;
  private container: HTMLDivElement | null = null;
  private mounting: Promise<void> | null = null;
  private readonly waiters = new Set<TokenWaiter>();

  constructor(private readonly siteKey: string) {}

  get configured(): boolean {
    return invalidSiteKeyDetail(this.siteKey) === null && !isLocalEnvironment();
  }

  async mount(parent: HTMLElement): Promise<void> {
    if (isLocalEnvironment() || this.widgetId) return;
    const invalidDetail = invalidSiteKeyDetail(this.siteKey);
    if (invalidDetail) {
      throw new TurnstileClientError("CONFIGURATION_ERROR", invalidDetail);
    }
    if (this.mounting) return this.mounting;

    this.mounting = (async () => {
      await loadTurnstileScript();
      if (!window.turnstile)
        throw new TurnstileClientError("SCRIPT_LOAD_FAILED");

      this.container ??= document.createElement("div");
      this.container.className = "turnstile-container";
      if (!this.container.isConnected) {
        parent.insertBefore(this.container, parent.querySelector(".wish-submit"));
      }

      try {
        this.widgetId = window.turnstile.render(this.container, {
          sitekey: this.siteKey,
          action: "wish_submit",
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          execution: "render",
          retry: "auto",
          "response-field": false,
          callback: (token: string) => {
            this.token = token;
            this.resolveWaiters(token);
          },
          "expired-callback": () => {
            this.token = null;
          },
          "timeout-callback": () => {
            this.token = null;
            this.rejectWaiters(
              new TurnstileClientError("CHALLENGE_TIMEOUT"),
            );
          },
          "error-callback": (errorCode: string | number) => {
            this.token = null;
            const code = String(errorCode);
            if (code.startsWith("110")) {
              this.rejectWaiters(
                new TurnstileClientError("CONFIGURATION_ERROR", code),
              );
              return true;
            }
            return false;
          },
        });
      } catch (error) {
        this.widgetId = null;
        throw new TurnstileClientError(
          "CONFIGURATION_ERROR",
          error instanceof Error ? error.message : undefined,
        );
      }
    })();

    try {
      await this.mounting;
    } finally {
      this.mounting = null;
    }
  }

  async getToken(parent: HTMLElement): Promise<string | null> {
    if (isLocalEnvironment()) return null;
    const invalidDetail = invalidSiteKeyDetail(this.siteKey);
    if (invalidDetail) {
      throw new TurnstileClientError("CONFIGURATION_ERROR", invalidDetail);
    }

    await this.mount(parent);
    if (this.token) return this.token;

    return new Promise<string>((resolve, reject) => {
      const waiter: TokenWaiter = {
        resolve,
        reject,
        timeoutId: window.setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new TurnstileClientError("CHALLENGE_TIMEOUT"));
        }, TURNSTILE_TOKEN_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  reset(): void {
    this.token = null;
    this.rejectWaiters(new TurnstileClientError("CHALLENGE_TIMEOUT"));
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
  }

  private resolveWaiters(token: string): void {
    for (const waiter of this.waiters) {
      window.clearTimeout(waiter.timeoutId);
      waiter.resolve(token);
    }
    this.waiters.clear();
  }

  private rejectWaiters(error: TurnstileClientError): void {
    for (const waiter of this.waiters) {
      window.clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}
