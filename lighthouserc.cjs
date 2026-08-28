const { join } = require("node:path");
const { tmpdir } = require("node:os");
const formFactor = process.env.LHCI_FORM_FACTOR === "mobile" ? "mobile" : "desktop";
const rawBaseUrl = process.env.LHCI_BASE_URL?.trim();
const chromePath = process.env.CHROME_PATH?.trim();

if (!rawBaseUrl) {
  throw new Error("LHCI_BASE_URL is required.");
}

if (!chromePath) {
  throw new Error("CHROME_PATH is required.");
}

const parsedBaseUrl = new URL(rawBaseUrl);
if (parsedBaseUrl.protocol !== "https:") {
  throw new Error("LHCI_BASE_URL must use HTTPS.");
}
if (parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) {
  throw new Error("LHCI_BASE_URL must not contain credentials, a query string, or a fragment.");
}

const baseUrl = parsedBaseUrl.origin;
const settings = {
  throttlingMethod: "simulate",
  disableStorageReset: true,
  onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  chromeFlags: "--no-sandbox --disable-dev-shm-usage",
};

if (formFactor === "desktop") {
  settings.preset = "desktop";
} else {
  settings.formFactor = "mobile";
  settings.screenEmulation = {
    mobile: true,
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    disabled: false,
  };
}

module.exports = {
  ci: {
    collect: {
      url: [`${baseUrl}/`],
      numberOfRuns: 3,
      puppeteerScript: "scripts/lighthouse-auth.cjs",
      puppeteerLaunchOptions: {
        executablePath: chromePath,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      },
      settings,
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 1 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 1 }],
        "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.05 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: join(tmpdir(), "hope-lighthouse", formFactor),
    },
  },
};
