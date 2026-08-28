import { readFileSync } from "node:fs";

const rawBaseUrl = process.env.LHCI_BASE_URL?.trim();
const environment = process.env.LHCI_DEPLOYMENT_ENV?.trim().toLowerCase();
const secretFile = process.env.LHCI_BYPASS_SECRET_FILE?.trim();
const allowedSuffixes = (process.env.LHCI_ALLOWED_HOST_SUFFIXES ?? ".vercel.app")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!rawBaseUrl) throw new Error("LHCI_BASE_URL is required.");
if (!['preview', 'production'].includes(environment)) {
  throw new Error("LHCI_DEPLOYMENT_ENV must be preview or production.");
}

const base = new URL(rawBaseUrl);
if (base.protocol !== "https:") throw new Error("Deployment URL must use HTTPS.");
if (base.username || base.password || base.search || base.hash) {
  throw new Error("Deployment URL must not contain credentials, query parameters, or fragments.");
}

const hostname = base.hostname.toLowerCase();
const trusted = allowedSuffixes.some((suffix) =>
  suffix.startsWith(".") ? hostname.endsWith(suffix) : hostname === suffix,
);
if (!trusted) throw new Error(`Refusing requests to untrusted deployment host: ${hostname}`);

let bypassSecret = "";
if (environment === "preview") {
  if (!secretFile) throw new Error("LHCI_BYPASS_SECRET_FILE is required for Preview verification.");
  bypassSecret = readFileSync(secretFile, "utf8").trim();
  if (!bypassSecret) throw new Error("Vercel automation bypass secret is empty.");
}

async function request(path, { expectJson = false, rejectProductFallback = false } = {}) {
  const url = new URL(path, base.origin);
  const headers = { accept: expectJson ? "application/json" : "text/html,application/json;q=0.9" };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;

  const response = await fetch(url, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  if (rejectProductFallback && response.headers.get("x-hope-fallback") === "1") {
    throw new Error(`${path} is serving the bundled fallback instead of the real product backend.`);
  }
  if (expectJson) {
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/json")) {
      throw new Error(`${path} did not return JSON.`);
    }
    await response.json();
  }
}

await request("/");
await request("/api/health", { expectJson: true });
await request("/api/products", { expectJson: true, rejectProductFallback: true });
await request("/api/wishes", { expectJson: true });

console.log(`Verified real ${environment} deployment routes without synthetic responses.`);
