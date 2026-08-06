import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
const violations = [];

const manager = String(packageJson.packageManager ?? "");
const match = /^pnpm@(\d+)\.(\d+)\.(\d+)$/.exec(manager);
if (!match) {
  violations.push("packageManager must pin an exact pnpm version");
} else {
  const [major, minor] = [Number(match[1]), Number(match[2])];
  if (major < 11 || (major === 11 && minor < 10)) {
    violations.push(`pnpm ${match.slice(1).join(".")} is below the reviewed baseline 11.10.0`);
  }
}

const requiredWorkspaceSettings = [
  /minimumReleaseAge:\s*1440\b/,
  /minimumReleaseAgeStrict:\s*true\b/,
  /minimumReleaseAgeIgnoreMissingTime:\s*false\b/,
  /blockExoticSubdeps:\s*true\b/,
  /strictDepBuilds:\s*true\b/,
  /trustLockfile:\s*false\b/,
  /allowBuilds:\s*[\s\S]*?esbuild:\s*true\b/,
];
for (const pattern of requiredWorkspaceSettings) {
  if (!pattern.test(workspace)) violations.push(`missing required pnpm policy: ${pattern}`);
}

const exoticPatterns = [
  /\bgit\+(?:ssh|https?|file):\/\//i,
  /\b(?:github|gitlab|bitbucket):[^\s]+/i,
  /\btarball:\s*https?:\/\//i,
  /https?:\/\/[^\s]+\.(?:tgz|tar\.gz)\b/i,
];
for (const pattern of exoticPatterns) {
  if (pattern.test(lockfile)) violations.push(`lockfile contains an exotic dependency source matching ${pattern}`);
}

if (violations.length) {
  console.error("Dependency policy check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log("Dependency policy check passed.");
