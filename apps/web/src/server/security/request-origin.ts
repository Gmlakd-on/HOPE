function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTrustedAdminMutationRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) return normalizedOrigin(origin) === requestOrigin;

  const referer = request.headers.get("referer");
  if (referer) return normalizedOrigin(referer) === requestOrigin;

  return false;
}
