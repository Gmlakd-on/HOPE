import { BubbleEngine } from "./bubble-engine";
import { initializeFooterBoundary } from "./footer";
import { initializeHomeStats } from "./home-stats";
import { initializeI18n } from "./i18n";
import { initializeIntro } from "./intro";
import { initializeNavigation } from "./navigation";
import { initializeProducts } from "./products";
import { cleanupLegacyRootServiceWorker } from "./service-worker-cleanup";
import { WishApiClient } from "./wish-api";
import { initializeWishForm } from "./wish-form";

function safelyInitialize(name: string, initializer: () => void): void {
  try {
    initializer();
  } catch (error) {
    console.error(`${name} initialization failed`, error);
  }
}

// The intro must initialize first so a failure in another feature cannot trap
// the visitor behind the opening screen.
safelyInitialize("intro", initializeIntro);
safelyInitialize("service worker cleanup", cleanupLegacyRootServiceWorker);
safelyInitialize("navigation", initializeNavigation);
safelyInitialize("i18n", initializeI18n);
safelyInitialize("products", initializeProducts);
safelyInitialize("home stats", initializeHomeStats);
safelyInitialize("footer", initializeFooterBoundary);

const endpoint =
  document.getElementById("wishForm")?.dataset.endpoint ?? "/api/wishes";
const api = new WishApiClient(endpoint);
const bubbles = new BubbleEngine(api);
void bubbles.initialize().catch((error) => {
  console.error("bubble initialization failed", error);
});

const destroyBubbles = (): void => bubbles.destroy();
window.addEventListener("pagehide", destroyBubbles, { once: true });
document.addEventListener("astro:before-swap", destroyBubbles, { once: true });

safelyInitialize("wish form", () => initializeWishForm(api, bubbles));
