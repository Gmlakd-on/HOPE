const { readFileSync, rmSync } = require("node:fs");

function allowedHost(hostname) {
  const configured = (process.env.LHCI_ALLOWED_HOST_SUFFIXES ?? ".vercel.app")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const lower = hostname.toLowerCase();
  return configured.some((suffix) =>
    suffix.startsWith(".") ? lower.endsWith(suffix) : lower === suffix,
  );
}

module.exports = async (browser, { url }) => {
  const target = new URL(url);
  if (target.protocol !== "https:" || !allowedHost(target.hostname)) {
    throw new Error(`Refusing Lighthouse authentication for untrusted host: ${target.hostname}`);
  }

  const deploymentEnvironment = process.env.LHCI_DEPLOYMENT_ENV?.trim().toLowerCase();
  const secretFile = process.env.LHCI_BYPASS_SECRET_FILE?.trim();

  // Production is expected to be directly reachable. Preview may be protected.
  if (deploymentEnvironment !== "preview") {
    const page = await browser.newPage();
    try {
      const response = await page.goto(target.href, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response || !response.ok()) {
        throw new Error(`Deployment returned HTTP ${response?.status() ?? "unknown"}.`);
      }
      if (new URL(page.url()).origin !== target.origin) {
        throw new Error("Deployment redirected to a different origin.");
      }
    } finally {
      await page.close();
    }
    return;
  }

  if (!secretFile) {
    throw new Error("LHCI_BYPASS_SECRET_FILE is required for protected Preview deployments.");
  }

  let secret;
  try {
    secret = readFileSync(secretFile, "utf8").trim();
  } finally {
    // Remove the credential file as soon as it has been read.
    rmSync(secretFile, { force: true });
  }

  if (!secret) {
    throw new Error("Vercel automation bypass secret is empty.");
  }

  const page = await browser.newPage();
  const requestHandler = (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== target.origin) {
      void request.continue();
      return;
    }

    void request.continue({
      headers: {
        ...request.headers(),
        "x-vercel-protection-bypass": secret,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
  };

  try {
    await page.setRequestInterception(true);
    page.on("request", requestHandler);

    const firstResponse = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!firstResponse || !firstResponse.ok()) {
      throw new Error(`Vercel bypass request returned HTTP ${firstResponse?.status() ?? "unknown"}.`);
    }

    page.off("request", requestHandler);
    await page.setRequestInterception(false);
    secret = "";

    // Verify the browser now reaches the same deployment using only the Vercel bypass cookie.
    const secondResponse = await page.goto(target.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!secondResponse || !secondResponse.ok()) {
      throw new Error(`Preview cookie verification returned HTTP ${secondResponse?.status() ?? "unknown"}.`);
    }
    if (new URL(page.url()).origin !== target.origin) {
      throw new Error("Preview authentication redirected to a different origin.");
    }
  } finally {
    page.off("request", requestHandler);
    await page.close();
  }
};
