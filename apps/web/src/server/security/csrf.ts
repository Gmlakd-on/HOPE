import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { adminSecuritySecret, type AdminEnvironment } from "../admin-auth";
import { readFormText } from "../form-data";

export const ADMIN_CSRF_FIELD = "csrfToken";

interface CsrfPayload {
  readonly nonce: string;
  readonly issuedAt: number;
}

export interface AdminCsrfProtection {
  readonly token: string;
  readonly cookieHeader: string | null;
}

const SECURE_CSRF_COOKIE = "__Host-hope_admin_csrf";
const DEVELOPMENT_CSRF_COOKIE = "hope_admin_csrf";
const CSRF_TTL_SECONDS = 60 * 60 * 6;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secureEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function cookieName(request: Request): string {
  return isSecureRequest(request)
    ? SECURE_CSRF_COOKIE
    : DEVELOPMENT_CSRF_COOKIE;
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

function sign(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret)
    .update("admin-csrf-v1\u0000", "utf8")
    .update(payloadPart, "utf8")
    .digest("base64url");
}

function createToken(secret: string): string {
  const payloadPart = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(24).toString("base64url"),
      issuedAt: Date.now(),
    } satisfies CsrfPayload),
    "utf8",
  ).toString("base64url");

  return `${payloadPart}.${sign(payloadPart, secret)}`;
}

function isValidToken(token: string | null, secret: string): token is string {
  if (!token || token.length > 512) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  if (!secureEqual(signaturePart, sign(payloadPart, secret))) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as Partial<CsrfPayload>;

    if (
      typeof parsed.nonce !== "string" ||
      parsed.nonce.length < 20 ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt)
    ) {
      return false;
    }

    const age = Date.now() - parsed.issuedAt;
    return age >= -CLOCK_SKEW_MS && age <= CSRF_TTL_SECONDS * 1_000;
  } catch {
    return false;
  }
}

function csrfCookieHeader(token: string, request: Request): string {
  const attributes = [
    `${cookieName(request)}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${CSRF_TTL_SECONDS}`,
    "Priority=High",
  ];
  if (isSecureRequest(request)) attributes.push("Secure");
  return attributes.join("; ");
}

export function ensureAdminCsrfProtection(
  request: Request,
  environment: AdminEnvironment,
): AdminCsrfProtection {
  const secret = adminSecuritySecret(environment);
  if (!secret) {
    throw new Error("Admin CSRF protection is not configured securely.");
  }

  const existing = parseCookieValue(request, cookieName(request));
  if (isValidToken(existing, secret)) {
    return { token: existing, cookieHeader: null };
  }

  const token = createToken(secret);
  return {
    token,
    cookieHeader: csrfCookieHeader(token, request),
  };
}

export function verifyAdminCsrfToken(
  request: Request,
  form: FormData,
  environment: AdminEnvironment,
): boolean {
  const secret = adminSecuritySecret(environment);
  if (!secret) return false;

  const cookieToken = parseCookieValue(request, cookieName(request));
  const formToken = readFormText(form, ADMIN_CSRF_FIELD);

  return (
    isValidToken(cookieToken, secret) &&
    isValidToken(formToken, secret) &&
    secureEqual(cookieToken, formToken)
  );
}
