const INTRO_FALLBACK_DURATION_MS = 1_850;

const body = document.body;
const intro = document.getElementById("introScreen");
const target = document.getElementById("introWaterTarget");
const site = document.getElementById("siteRoot");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

if (intro && target && site) {
  let fallbackStarted = false;

  const forceOpen = (): void => {
    intro.hidden = true;
    intro.style.display = "none";
    site.removeAttribute("inert");
    body.classList.remove("intro-active", "intro-revealing");
    body.classList.add("intro-complete");
  };

  const startFallbackReveal = (): void => {
    if (
      fallbackStarted ||
      document.documentElement.dataset.introReady === "true"
    ) {
      return;
    }

    fallbackStarted = true;
    site.removeAttribute("inert");
    body.classList.add("intro-revealing");
    intro.classList.add("is-revealing");
    window.setTimeout(forceOpen, INTRO_FALLBACK_DURATION_MS);
  };

  target.addEventListener(
    "pointerenter",
    (event) => {
      if (finePointer.matches && event.pointerType !== "touch") {
        startFallbackReveal();
      }
    },
    { capture: true },
  );

  target.addEventListener("click", startFallbackReveal, { capture: true });
}
