import { query, queryAll } from "./dom";

export class FocusModal {
  private lastFocused: HTMLElement | null = null;
  private readonly paper: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly backdrop: HTMLButtonElement;
  private readonly events = new AbortController();
  private focusTimer: number | null = null;
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    closeSelector: string,
  ) {
    this.paper = query<HTMLElement>(".letter-paper", root);
    this.closeButton = query<HTMLButtonElement>(closeSelector, root);
    this.backdrop = query<HTMLButtonElement>(".modal-backdrop", root);

    const signal = this.events.signal;
    this.closeButton.addEventListener("click", () => this.close(), { signal });
    this.backdrop.addEventListener("click", () => this.close(), { signal });
    document.addEventListener("keydown", this.onKeyDown, { signal });
    window.addEventListener("pagehide", () => this.destroy(), {
      once: true,
      signal,
    });
    document.addEventListener("astro:before-swap", () => this.destroy(), {
      once: true,
      signal,
    });
  }

  open(focusTarget: HTMLElement = this.paper): void {
    if (this.destroyed) return;

    this.lastFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.classList.add("modal-open");
    this.root.removeAttribute("inert");
    this.root.classList.add("is-open");
    this.root.setAttribute("aria-hidden", "false");
    this.root.dispatchEvent(new CustomEvent("hope-modal-open"));
    this.scheduleFocus(() => focusTarget.focus(), 50);
  }

  close(): void {
    if (this.destroyed) return;

    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.root.setAttribute("inert", "");
    document.body.classList.remove("modal-open");
    this.root.dispatchEvent(new CustomEvent("hope-modal-close"));

    const target = this.lastFocused;
    this.lastFocused = null;
    this.scheduleFocus(() => target?.focus(), 30);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.events.abort();
    this.clearFocusTimer();
    this.lastFocused = null;
    this.root.classList.remove("is-open");
    this.root.setAttribute("aria-hidden", "true");
    this.root.setAttribute("inert", "");
    document.body.classList.remove("modal-open");
  }

  get isOpen(): boolean {
    return !this.destroyed && this.root.classList.contains("is-open");
  }

  private scheduleFocus(callback: () => void, delay: number): void {
    this.clearFocusTimer();
    this.focusTimer = window.setTimeout(() => {
      this.focusTimer = null;
      if (!this.destroyed) callback();
    }, delay);
  }

  private clearFocusTimer(): void {
    if (this.focusTimer === null) return;
    window.clearTimeout(this.focusTimer);
    this.focusTimer = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = queryAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      this.root,
    ).filter(
      (element) =>
        !element.hasAttribute("hidden") && element.offsetParent !== null,
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
