import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface AdminEnvironment {
  readonly ADMIN_USERNAME: string | undefined;
  readonly ADMIN_PASSWORD: string | undefined;
  readonly ADMIN_SESSION_SECRET: string | undefined;
}

export interface AdminAuthResult {
  readonly configured: boolean;
  readonly authorized: boolean;
  readonly username: string | null;
}

interface SessionPayload {
  readonly version: 1;
  readonly username: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly credentialVersion: string;
}

interface AdminConfiguration {
  readonly configured: boolean;
  readonly username: string;
  readonly password: string;
  readonly sessionSecret: string;
}

const SECURE_SESSION_COOKIE = "__Host-hope_admin_session";
const DEVELOPMENT_SESSION_COOKIE = "hope_admin_session";
const LEGACY_SESSION_COOKIE = "hope_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secureEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function parseCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1);
  }
  return null;
}

function resolveConfiguration(environment: AdminEnvironment): AdminConfiguration {
  const username = environment.ADMIN_USERNAME?.trim() ?? "";
  const password = environment.ADMIN_PASSWORD ?? "";
  const sessionSecret = environment.ADMIN_SESSION_SECRET?.trim() ?? "";

  return {
    configured: Boolean(
      username &&
        username.length <= 200 &&
        password.length >= 12 &&
        password.length <= 1_024 &&
        sessionSecret.length >= 32,
    ),
    username,
    password,
    sessionSecret,
  };
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function sessionCookieName(request: Request): string {
  return isSecureRequest(request)
    ? SECURE_SESSION_COOKIE
    : DEVELOPMENT_SESSION_COOKIE;
}

function credentialVersion(configuration: AdminConfiguration): string {
  return createHmac("sha256", configuration.sessionSecret)
    .update(configuration.username, "utf8")
    .update("\u0000", "utf8")
    .update(configuration.password, "utf8")
    .digest("base64url")
    .slice(0, 22);
}

function signSessionPayload(
  payload: string,
  configuration: AdminConfiguration,
): string {
  return createHmac("sha256", configuration.sessionSecret)
    .update(payload, "utf8")
    .digest("base64url");
}

function parseSession(
  value: string | null,
  configuration: AdminConfiguration,
): SessionPayload | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const payloadPart = value.slice(0, separator);
  const signaturePart = value.slice(separator + 1);
  const expectedSignature = signSessionPayload(payloadPart, configuration);
  if (!secureEqual(signaturePart, expectedSignature)) return null;

  const decoded = base64UrlDecode(payloadPart);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as Partial<SessionPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.username !== "string" ||
      !parsed.username ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.credentialVersion !== "string" ||
      !parsed.credentialVersion
    ) {
      return null;
    }

    const now = Date.now();
    if (parsed.issuedAt > now + CLOCK_SKEW_MS) return null;
    if (parsed.expiresAt <= now) return null;
    if (parsed.expiresAt - parsed.issuedAt > SESSION_TTL_SECONDS * 1_000) {
      return null;
    }
    if (!secureEqual(parsed.username, configuration.username)) return null;
    if (
      !secureEqual(
        parsed.credentialVersion,
        credentialVersion(configuration),
      )
    ) {
      return null;
    }

    return {
      version: 1,
      username: parsed.username,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
      credentialVersion: parsed.credentialVersion,
    };
  } catch {
    return null;
  }
}

export function adminSecuritySecret(
  environment: AdminEnvironment,
): string | null {
  const configuration = resolveConfiguration(environment);
  return configuration.configured ? configuration.sessionSecret : null;
}

export function verifyAdminCredentials(
  username: string,
  password: string,
  environment: AdminEnvironment,
): AdminAuthResult {
  const configuration = resolveConfiguration(environment);
  if (!configuration.configured) {
    return { configured: false, authorized: false, username: null };
  }

  const authorized =
    secureEqual(username.trim(), configuration.username) &&
    secureEqual(password, configuration.password);

  return {
    configured: true,
    authorized,
    username: authorized ? configuration.username : null,
  };
}

export function verifyAdminRequest(
  request: Request,
  environment: AdminEnvironment,
): AdminAuthResult {
  const configuration = resolveConfiguration(environment);
  if (!configuration.configured) {
    return { configured: false, authorized: false, username: null };
  }

  const session = parseSession(
    parseCookieValue(request, sessionCookieName(request)),
    configuration,
  );

  if (!session) {
    return { configured: true, authorized: false, username: null };
  }

  return {
    configured: true,
    authorized: true,
    username: configuration.username,
  };
}

export function createAdminSessionCookie(
  environment: AdminEnvironment,
): string {
  const configuration = resolveConfiguration(environment);
  if (!configuration.configured) {
    throw new Error("Admin authentication is not configured securely.");
  }

  const issuedAt = Date.now();
  const payload = base64UrlEncode(
    JSON.stringify({
      version: 1,
      username: configuration.username,
      issuedAt,
      expiresAt: issuedAt + SESSION_TTL_SECONDS * 1_000,
      credentialVersion: credentialVersion(configuration),
    } satisfies SessionPayload),
  );
  const signature = signSessionPayload(payload, configuration);
  return `${payload}.${signature}`;
}

export function adminSessionCookieHeader(
  value: string,
  request: Request,
): string {
  const secure = isSecureRequest(request);
  const attributes = [
    `${sessionCookieName(request)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "Priority=High",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

function expiredCookieHeader(name: string, secure: boolean): string {
  const attributes = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Priority=High",
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearAdminSessionCookieHeaders(
  request: Request,
): readonly string[] {
  const secure = isSecureRequest(request);
  const headers = [
    expiredCookieHeader(sessionCookieName(request), secure),
  ];

  if (sessionCookieName(request) !== LEGACY_SESSION_COOKIE) {
    headers.push(expiredCookieHeader(LEGACY_SESSION_COOKIE, secure));
  }

  return headers;
}

export function adminChallengeHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive",
  };
}
