import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname, normalize } from "node:path";

const forbiddenDirectorySegments = new Set([
  "node_modules",
  ".pnpm-store",
  ".vercel",
  ".netlify",
  ".wrangler",
  ".supabase",
  ".astro",
  ".output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".vite",
  ".cache",
  ".turbo",
  ".nyc_output",
  ".vitest",
  ".lighthouseci",
  "coverage",
  "playwright-report",
  "test-results",
  "blob-report",
  "logs",
  "dist",
]);

const forbiddenBasenames = [
  /^\.env(?:\..+)?$/,
  /^\.envrc(?:\..+)?$/,
  /^\.dev\.vars(?:\..+)?$/,
  /^id_(?:rsa|ed25519)(?:\..+)?$/,
  /^credentials(?:\..+)?\.json$/,
  /^service-account(?:\..+)?\.json$/,
  /^.+-service-account\.json$/,
];

const allowedExamples = [
  /^\.env(?:\..+)?\.example$/,
  /^\.envrc(?:\..+)?\.example$/,
  /^\.dev\.vars(?:\..+)?\.example$/,
  /^.+\.tfvars(?:\.json)?\.example$/,
];

const forbiddenExtensions = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".tfstate",
  ".tfvars",
]);

const forbiddenStateBasenames = [
  /^.+\.tfstate(?:\..+)?$/,
  /^.+\.tfvars(?:\.json)?$/,
];

const forbiddenArchiveExtensions = new Set([
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".tgz",
]);

const highConfidenceSecretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ["Stripe live secret", /\bsk_live_[0-9A-Za-z]{20,}\b/],
  ["Supabase secret key", /\bsb_secret_[0-9A-Za-z._-]{20,}\b/],
  ["npm authentication token", /:_authToken\s*=\s*(?!\$\{)[^\s#]{8,}/],
  ["JWT", /\beyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{20,}\b/],
];

function gitFiles() {
  try {
    return execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    throw new Error("Run this command from inside a Git working tree.");
  }
}

const violations = [];

for (const rawPath of gitFiles()) {
  const filePath = normalize(rawPath).replaceAll("\\", "/");
  const segments = filePath.split("/");
  const name = basename(filePath);

  if (segments.some((segment) => forbiddenDirectorySegments.has(segment))) {
    violations.push(`${filePath}: generated or local-state directory must not be committed`);
    continue;
  }

  if (
    !allowedExamples.some((pattern) => pattern.test(name)) &&
    forbiddenBasenames.some((pattern) => pattern.test(name))
  ) {
    violations.push(`${filePath}: environment or credential filename must not be committed`);
    continue;
  }

  if (
    forbiddenExtensions.has(extname(name).toLowerCase()) ||
    forbiddenStateBasenames.some((pattern) => pattern.test(name))
  ) {
    violations.push(`${filePath}: private-key or state-file extension must not be committed`);
    continue;
  }

  if (forbiddenArchiveExtensions.has(extname(name).toLowerCase())) {
    violations.push(`${filePath}: source archives must not be committed`);
    continue;
  }

  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of highConfidenceSecretPatterns) {
    if (pattern.test(content)) {
      violations.push(`${filePath}: possible ${label} detected`);
    }
  }
}

if (violations.length > 0) {
  console.error("Repository safety check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Repository safety check passed.");
