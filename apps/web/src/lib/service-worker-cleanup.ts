export function cleanupLegacyRootServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      void (async () => {
        try {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            if (new URL(registration.scope).pathname === "/") {
              await registration.unregister();
            }
          }
        } catch {
          // A cleanup failure must never block or surface in the main experience.
        }
      })();
    },
    { once: true },
  );
}
