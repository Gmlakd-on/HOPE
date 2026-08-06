import { createHmac } from "node:crypto";
import {
  adminSecuritySecret,
  type AdminEnvironment,
} from "../admin-auth";

export interface AdminLoginRateLimitStatus {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

interface AttemptState {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  updatedAt: number;
}

const WINDOW_MS = 10 * 60 * 1_000;
const MAX_FAILURES = 5;
const HARD_BLOCK_MS = 15 * 60 * 1_000;
const STALE_ENTRY_MS = 60 * 60 * 1_000;
const MAX_ENTRIES = 5_000;
const attempts = new Map<string, AttemptState>();
let writesSincePrune = 0;

function clientIp(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwarded ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown-client"
  );
}

function normalizedUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US").slice(0, 200);
}

function key(secret: string, namespace: string, value: string): string {
  return createHmac("sha256", secret)
    .update(namespace, "utf8")
    .update("\u0000", "utf8")
    .update(value, "utf8")
    .digest("base64url");
}

function keysFor(
  request: Request,
  username: string,
  environment: AdminEnvironment,
): readonly string[] {
  const secret = adminSecuritySecret(environment);
  if (!secret) return [];

  return [
    key(secret, "ip", clientIp(request)),
    key(secret, "account", normalizedUsername(username) || "empty-account"),
  ];
}

function resetWindowIfExpired(state: AttemptState, now: number): AttemptState {
  if (now - state.windowStartedAt < WINDOW_MS) return state;
  return {
    failures: 0,
    windowStartedAt: now,
    blockedUntil: 0,
    updatedAt: now,
  };
}

function progressiveDelayMs(failures: number): number {
  if (failures < 2) return 0;
  return Math.min(8_000, 1_000 * 2 ** (failures - 2));
}

function prune(now: number): void {
  writesSincePrune += 1;
  if (writesSincePrune < 100 && attempts.size <= MAX_ENTRIES) return;
  writesSincePrune = 0;

  for (const [entryKey, state] of attempts) {
    if (now - state.updatedAt > STALE_ENTRY_MS) attempts.delete(entryKey);
  }

  if (attempts.size <= MAX_ENTRIES) return;
  const oldest = [...attempts.entries()]
    .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
    .slice(0, attempts.size - MAX_ENTRIES);
  for (const [entryKey] of oldest) attempts.delete(entryKey);
}

export function inspectAdminLoginRateLimit(
  request: Request,
  username: string,
  environment: AdminEnvironment,
): AdminLoginRateLimitStatus {
  const now = Date.now();
  let retryAfterMs = 0;

  for (const entryKey of keysFor(request, username, environment)) {
    const current = attempts.get(entryKey);
    if (!current) continue;

    const state = resetWindowIfExpired(current, now);
    attempts.set(entryKey, state);
    retryAfterMs = Math.max(retryAfterMs, state.blockedUntil - now);
  }

  return {
    allowed: retryAfterMs <= 0,
    retryAfterSeconds: Math.max(0, Math.ceil(retryAfterMs / 1_000)),
  };
}

export function recordFailedAdminLogin(
  request: Request,
  username: string,
  environment: AdminEnvironment,
): AdminLoginRateLimitStatus {
  const now = Date.now();
  let retryAfterMs = 0;

  for (const entryKey of keysFor(request, username, environment)) {
    const existing = attempts.get(entryKey);
    const state = existing
      ? resetWindowIfExpired(existing, now)
      : {
          failures: 0,
          windowStartedAt: now,
          blockedUntil: 0,
          updatedAt: now,
        };

    state.failures += 1;
    const delay =
      state.failures >= MAX_FAILURES
        ? HARD_BLOCK_MS
        : progressiveDelayMs(state.failures);
    state.blockedUntil = Math.max(state.blockedUntil, now + delay);
    state.updatedAt = now;
    attempts.set(entryKey, state);
    retryAfterMs = Math.max(retryAfterMs, delay);
  }

  prune(now);
  return {
    allowed: retryAfterMs <= 0,
    retryAfterSeconds: Math.max(0, Math.ceil(retryAfterMs / 1_000)),
  };
}

export function clearAdminLoginRateLimit(
  request: Request,
  username: string,
  environment: AdminEnvironment,
): void {
  for (const entryKey of keysFor(request, username, environment)) {
    attempts.delete(entryKey);
  }
}
