const formFactor = process.env.LHCI_FORM_FACTOR === "mobile" ? "mobile" : "desktop";
const baseUrl = (process.env.LHCI_BASE_URL || "http://127.0.0.1:4321").replace(/\/$/, "");
const usesExternalServer = Boolean(process.env.LHCI_BASE_URL);

const settings = {
  throttlingMethod: "simulate",
  onlyCategories: [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ],
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
      ...(!usesExternalServer
        ? {
            startServerCommand:
              "pnpm --filter @hope/web preview --host 127.0.0.1 --port 4321",
            startServerReadyPattern: "Local",
          }
        : {}),
      url: [`${baseUrl}/`],
      numberOfRuns: 3,
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
    upload: { target: "temporary-public-storage" },
  },
};
