import type { APIRoute } from "astro";
import {
  adminChallengeHeaders,
  adminSessionCookieHeader,
  clearAdminSessionCookieHeaders,
  createAdminSessionCookie,
  verifyAdminCredentials,
} from "../../../server/admin-auth";
import { adminEnvironment } from "../../../server/admin-environment";
import { readFormText } from "../../../server/form-data";
import {
  clearAdminLoginRateLimit,
  inspectAdminLoginRateLimit,
  recordFailedAdminLogin,
} from "../../../server/security/admin-rate-limit";
import { verifyAdminCsrfToken } from "../../../server/security/csrf";
import { isTrustedAdminMutationRequest } from "../../../server/security/request-origin";

export const prerender = false;

function secureRedirect(
  redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response,
  path: string,
): Response {
  const response = redirect(path, 303);
  const headers = adminChallengeHeaders();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") response.headers.set(name, value);
  }
  return response;
}

function appendCookies(response: Response, cookies: readonly string[]): void {
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isTrustedAdminMutationRequest(request)) {
    return secureRedirect(redirect, "/admin?error=forbidden");
  }

  const environment = adminEnvironment();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return secureRedirect(redirect, "/admin?error=invalid-request");
  }

  if (!verifyAdminCsrfToken(request, form, environment)) {
    return secureRedirect(redirect, "/admin?error=csrf-failed");
  }

  const action = readFormText(form, "action", "login").trim();
  if (action === "logout") {
    const response = secureRedirect(redirect, "/admin?result=logged-out");
    appendCookies(response, clearAdminSessionCookieHeaders(request));
    return response;
  }

  if (action !== "login") {
    return secureRedirect(redirect, "/admin?error=invalid-request");
  }

  const username = readFormText(form, "username").slice(0, 200);
  const password = readFormText(form, "password").slice(0, 1_024);
  const currentLimit = inspectAdminLoginRateLimit(
    request,
    username,
    environment,
  );

  if (!currentLimit.allowed) {
    const response = secureRedirect(redirect, "/admin?error=rate-limited");
    response.headers.set("retry-after", String(currentLimit.retryAfterSeconds));
    return response;
  }

  const auth = verifyAdminCredentials(username, password, environment);
  if (!auth.configured) {
    return secureRedirect(redirect, "/admin?error=not-configured");
  }

  if (!auth.authorized) {
    const failedLimit = recordFailedAdminLogin(request, username, environment);
    const response = secureRedirect(
      redirect,
      failedLimit.allowed
        ? "/admin?error=invalid-credentials"
        : "/admin?error=rate-limited",
    );
    if (failedLimit.retryAfterSeconds > 0) {
      response.headers.set(
        "retry-after",
        String(failedLimit.retryAfterSeconds),
      );
    }
    return response;
  }

  clearAdminLoginRateLimit(request, username, environment);
  const response = secureRedirect(redirect, "/admin?result=logged-in");
  response.headers.append(
    "set-cookie",
    adminSessionCookieHeader(createAdminSessionCookie(environment), request),
  );
  return response;
};

export const GET: APIRoute = async () =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: {
      ...adminChallengeHeaders(),
      allow: "POST",
      "content-type": "text/plain; charset=utf-8",
    },
  });
