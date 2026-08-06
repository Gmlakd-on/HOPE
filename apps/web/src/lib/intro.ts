import { byId } from "./dom";

const INTRO_REVEAL_DURATION_MS = 1_750;
const DEFAULT_REVEAL_X = 0.5;
const DEFAULT_REVEAL_Y = 0.5;

export function initializeIntro(): void {
  const body = document.body;
  const intro = byId<HTMLElement>("introScreen");
  const target = byId<HTMLButtonElement>("introWaterTarget");
  const ripples = byId<HTMLElement>("introRevealRipples");
  const cursor = byId<HTMLElement>("cupidCursor");
  const site = byId<HTMLElement>("siteRoot");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const coarsePointer = matchMedia("(hover: none), (pointer: coarse)");
  const shouldReduceIntroMotion = (): boolean =>
    reduceMotion.matches && !coarsePointer.matches;
  let revealed = false;

  document.documentElement.dataset.introReady = "true";
  site.setAttribute("inert", "");

  const setRevealOrigin = (clientX?: number, clientY?: number): void => {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);
    const x = Number.isFinite(clientX)
      ? Math.min(viewportWidth, Math.max(0, clientX ?? 0))
      : viewportWidth * DEFAULT_REVEAL_X;
    const y = Number.isFinite(clientY)
      ? Math.min(viewportHeight, Math.max(0, clientY ?? 0))
      : viewportHeight * DEFAULT_REVEAL_Y;

    ripples.style.setProperty("--reveal-x", `${x}px`);
    ripples.style.setProperty("--reveal-y", `${y}px`);
  };

  const complete = (): void => {
    intro.hidden = true;
    intro.style.display = "none";
    ripples.classList.remove("is-active");
    body.classList.remove("intro-active", "intro-revealing");
    body.classList.add("intro-complete");
    site.removeAttribute("inert");
    cursor.classList.remove("is-visible", "is-targeting", "is-fired");
    target.blur();
    if (!coarsePointer.matches) {
      byId<HTMLElement>("main").focus({ preventScroll: true });
    }
    window.dispatchEvent(new CustomEvent("hope-intro-complete"));
  };

  const reveal = (clientX?: number, clientY?: number): void => {
    if (revealed) return;

    revealed = true;
    setRevealOrigin(clientX, clientY);
    target.disabled = true;
    target.classList.add("is-arming");
    cursor.classList.add("is-targeting", "is-fired");
    site.removeAttribute("inert");

    requestAnimationFrame(() => {
      ripples.classList.add("is-active");
      intro.classList.add("is-revealing");
      body.classList.add("intro-revealing");
    });

    window.setTimeout(
      complete,
      shouldReduceIntroMotion() ? 80 : INTRO_REVEAL_DURATION_MS,
    );
  };

  const arm = (): void => {
    if (revealed) return;
    target.classList.add("is-arming");
    cursor.classList.add("is-targeting");
  };

  const disarm = (): void => {
    if (revealed) return;
    target.classList.remove("is-arming");
    cursor.classList.remove("is-targeting");
  };

  if (finePointer.matches) {
    document.addEventListener(
      "pointermove",
      (event) => {
        if (
          !body.classList.contains("intro-active") ||
          event.pointerType === "touch"
        ) {
          return;
        }

        cursor.style.transform = `translate3d(${event.clientX - 15}px, ${event.clientY - 51}px, 0)`;
        cursor.classList.add("is-visible");
      },
      { passive: true },
    );

    document.addEventListener("pointerleave", () => {
      cursor.classList.remove("is-visible");
    });
  }

  target.addEventListener("pointerenter", (event) => {
    arm();

    if (finePointer.matches && event.pointerType !== "touch") {
      reveal(event.clientX, event.clientY);
    }
  });

  target.addEventListener("pointerleave", disarm);
  target.addEventListener("focus", arm);
  target.addEventListener("blur", disarm);

  target.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    event.preventDefault();
    arm();
    reveal(event.clientX, event.clientY);
  });

  target.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    event.preventDefault();
  });

  target.addEventListener("click", (event) => {
    reveal(event.clientX || undefined, event.clientY || undefined);
  });

  intro.addEventListener("pointerup", (event) => {
    if (!coarsePointer.matches || revealed) return;

    const element = event.target as Element | null;
    const interactive = element?.closest(
      "a, button, input, textarea, select, summary, [role='button']",
    );
    if (interactive && interactive !== target) return;

    event.preventDefault();
    reveal(event.clientX, event.clientY);
  });
}
