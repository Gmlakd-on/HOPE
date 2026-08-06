import { byId, debounce } from "./dom";
import type { PublicWishDto, WishFeedDto } from "./wish-api";
import { type WishApiClient } from "./wish-api";

type BubbleWish = { id: string; ko?: string; en?: string };

const FEED_REFRESH_INTERVAL_MS = 20_000;
const FEED_REFRESH_TIMEOUT_MS = 7_000;
const MAX_REFRESH_BACKOFF_MS = 120_000;
const REFRESH_JITTER_RATIO = 0.15;
const OPTIMISTIC_WISH_TTL_MS = 120_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export class BubbleEngine {
  private readonly layer = byId<HTMLElement>("wishBubbleLayer");
  private readonly bubbleWish = new WeakMap<HTMLElement, BubbleWish | null>();
  private readonly timers = new Map<number, number>();
  private readonly transientTimers = new Set<number>();
  private readonly laneWishes = new Map<number, BubbleWish | null>();
  private readonly optimisticWishes = new Map<
    string,
    { readonly wish: BubbleWish; readonly expiresAt: number }
  >();
  private lifecycle = new AbortController();
  private refreshTimer: number | null = null;
  private refreshController: AbortController | null = null;
  private refreshPromise: Promise<void> | null = null;
  private wishes: BubbleWish[] = [];
  private cursor = 0;
  private immediateLaneCursor = 0;
  private started = false;
  private paused = false;
  private feedLoaded = false;
  private sessionSeeded = false;
  private feedSignature = "";
  private feedTotal = 0;
  private initialized = false;
  private destroyed = false;
  private refreshFailures = 0;
  private requestVersion = 0;

  constructor(private readonly api: WishApiClient) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.destroyed = false;
    this.lifecycle = new AbortController();
    const signal = this.lifecycle.signal;

    this.updateMode();

    if (document.body.classList.contains("intro-active")) {
      window.addEventListener("hope-intro-complete", () => this.start(), {
        once: true,
        signal,
      });
    } else {
      this.start();
    }

    window.addEventListener("hashchange", () => this.updateMode(), { signal });
    window.addEventListener("popstate", () => this.updateMode(), { signal });
    window.addEventListener("hope-route-change", () => this.updateMode(), {
      signal,
    });
    window.addEventListener(
      "hope-language-change",
      () => this.updateAllTexts(),
      { signal },
    );
    window.addEventListener(
      "resize",
      debounce(() => this.reflow(), 220),
      { passive: true, signal },
    );
    document.addEventListener("visibilitychange", this.onVisibilityChange, {
      signal,
    });

    await this.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.initialized = false;
    this.lifecycle.abort();
    this.clearRefreshTimer();
    this.refreshController?.abort();
    this.refreshController = null;
    this.requestVersion += 1;
    this.clear();
    this.optimisticWishes.clear();
    this.laneWishes.clear();
    this.wishes = [];
    this.started = false;
    this.paused = false;
    this.feedLoaded = false;
    this.sessionSeeded = false;
    this.feedSignature = "";
    this.feedTotal = 0;
    this.refreshFailures = 0;
  }

  pause(): void {
    this.paused = true;
    for (const bubble of this.layer.querySelectorAll<HTMLElement>(
      ".wish-bubble",
    )) {
      bubble.style.animationPlayState = "paused";
    }
  }

  resume(): void {
    this.paused = false;
    for (const bubble of this.layer.querySelectorAll<HTMLElement>(
      ".wish-bubble",
    )) {
      if (document.activeElement !== bubble) {
        bubble.style.animationPlayState = "running";
      }
    }
  }

  showImmediately(item: PublicWishDto): void {
    if (this.destroyed) return;

    const alreadyKnown = this.wishes.some((wish) => wish.id === item.id);
    const wish = this.toBubbleWish(item);
    this.optimisticWishes.set(wish.id, {
      wish,
      expiresAt: Date.now() + OPTIMISTIC_WISH_TTL_MS,
    });
    this.wishes = [
      wish,
      ...this.wishes.filter((entry) => entry.id !== wish.id),
    ];
    this.feedLoaded = true;

    if (!alreadyKnown) {
      this.feedTotal += 1;
      this.dispatchFeedTotal();
    }

    if (!this.started) return;
    if (!this.sessionSeeded) {
      this.seedSession();
      return;
    }

    this.displayWishNow(wish);
  }

  refresh(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.refreshPromise) return this.refreshPromise;

    this.clearRefreshTimer();
    const controller = new AbortController();
    const requestVersion = ++this.requestVersion;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FEED_REFRESH_TIMEOUT_MS);
    this.refreshController = controller;

    const task = this.performRefresh(controller.signal, requestVersion)
      .then(() => {
        this.refreshFailures = 0;
      })
      .catch((error: unknown) => {
        if (!this.destroyed && (timedOut || !isAbortError(error))) {
          this.refreshFailures += 1;
        }
        // Keep the last successfully loaded public wishes during temporary API errors.
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (this.refreshController === controller) {
          this.refreshController = null;
        }
        if (this.refreshPromise === task) this.refreshPromise = null;

        if (!this.destroyed && document.visibilityState === "visible") {
          this.scheduleNextRefresh();
        }
      });

    this.refreshPromise = task;
    return task;
  }

  private async performRefresh(
    signal: AbortSignal,
    requestVersion: number,
  ): Promise<void> {
    const previousIds = new Set(this.wishes.map((wish) => wish.id));
    const feed = await this.api.list(signal);

    if (this.destroyed || requestVersion !== this.requestVersion) return;

    const { wishes: nextWishes, optimisticCount } =
      this.mergeOptimisticWishes(feed);
    const newestWish = nextWishes.find((wish) => !previousIds.has(wish.id));
    const signature = nextWishes
      .map((wish) => `${wish.id}:${wish.ko ?? ""}:${wish.en ?? ""}`)
      .join("|");
    const wishesChanged = signature !== this.feedSignature;

    this.feedSignature = signature;
    this.feedTotal = Math.max(feed.total + optimisticCount, nextWishes.length);
    this.wishes = nextWishes;
    this.feedLoaded = true;
    this.dispatchFeedTotal();

    if (this.started && !this.sessionSeeded) {
      this.seedSession();
      return;
    }

    if (!this.started || !wishesChanged) return;

    this.syncVisibleWishTexts();
    if (newestWish) this.displayWishNow(newestWish);
  }

  private mergeOptimisticWishes(feed: WishFeedDto): {
    readonly wishes: BubbleWish[];
    readonly optimisticCount: number;
  } {
    const now = Date.now();
    const serverWishes = feed.items.map((item) => this.toBubbleWish(item));
    const serverIds = new Set(serverWishes.map((wish) => wish.id));
    const optimistic: BubbleWish[] = [];

    for (const [id, entry] of this.optimisticWishes) {
      if (serverIds.has(id) || entry.expiresAt <= now) {
        this.optimisticWishes.delete(id);
        continue;
      }
      optimistic.push(entry.wish);
    }

    return {
      wishes: [...optimistic, ...serverWishes],
      optimisticCount: optimistic.length,
    };
  }

  private scheduleNextRefresh(): void {
    this.clearRefreshTimer();

    const backoffMultiplier = Math.min(2 ** this.refreshFailures, 8);
    const baseDelay = Math.min(
      FEED_REFRESH_INTERVAL_MS * backoffMultiplier,
      MAX_REFRESH_BACKOFF_MS,
    );
    const jitter = baseDelay * REFRESH_JITTER_RATIO * (Math.random() * 2 - 1);
    const delay = Math.max(1_000, Math.round(baseDelay + jitter));

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer === null) return;
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      this.clearRefreshTimer();
      return;
    }

    void this.refresh();
  };

  private dispatchFeedTotal(): void {
    window.dispatchEvent(
      new CustomEvent("hope-wish-feed", {
        detail: { total: this.feedTotal },
      }),
    );
  }

  private toBubbleWish(item: PublicWishDto): BubbleWish {
    return item.locale === "en"
      ? { id: item.id, en: item.message }
      : { id: item.id, ko: item.message };
  }

  private localized(wish: BubbleWish): string {
    const language = window.HOPE_LANGUAGE === "en" ? "en" : "ko";
    return wish[language] ?? wish.ko ?? wish.en ?? "";
  }

  private lanes(): readonly { start: number; end: number }[] {
    if (innerWidth <= 430)
      return [
        { start: 0.05, end: 0.27 },
        { start: 0.73, end: 0.95 },
      ];
    if (innerWidth <= 760)
      return [
        { start: 0.045, end: 0.29 },
        { start: 0.71, end: 0.955 },
      ];
    if (innerWidth <= 1040)
      return [
        { start: 0.04, end: 0.28 },
        { start: 0.72, end: 0.96 },
      ];
    return [
      { start: 0.025, end: 0.16 },
      { start: 0.17, end: 0.305 },
      { start: 0.695, end: 0.83 },
      { start: 0.84, end: 0.975 },
    ];
  }

  private sizeRange(): { min: number; max: number } {
    if (innerWidth <= 430) return { min: 104, max: 128 };
    if (innerWidth <= 760) return { min: 116, max: 148 };
    if (innerWidth <= 1040) return { min: 136, max: 178 };
    return { min: 156, max: 220 };
  }

  private nextWish(): BubbleWish | null {
    if (this.wishes.length === 0) return null;
    const wish = this.wishes[this.cursor % this.wishes.length] ?? null;
    this.cursor = (this.cursor + 1) % this.wishes.length;
    return wish;
  }

  private setText(bubble: HTMLElement): void {
    const wish = this.bubbleWish.get(bubble) ?? null;
    const message = wish ? this.localized(wish) : "";
    const max = innerWidth <= 760 ? 24 : 38;
    const displayed =
      message.length > max ? `${message.slice(0, max)}…` : message;
    const span = bubble.querySelector("span");
    if (span) span.textContent = message ? `“${displayed}”` : "";

    bubble.classList.toggle("is-empty", message.length === 0);
    bubble.setAttribute(
      "aria-label",
      message
        ? window.HOPE_LANGUAGE === "en"
          ? `Pop wish bubble: ${message}`
          : `소원 비눗방울 터뜨리기: ${message}`
        : window.HOPE_LANGUAGE === "en"
          ? "Pop empty bubble"
          : "빈 비눗방울 터뜨리기",
    );
  }

  private updateAllTexts(): void {
    this.layer.setAttribute(
      "aria-label",
      window.HOPE_LANGUAGE === "en"
        ? "Public wish bubbles"
        : "공개 소원 비눗방울",
    );

    for (const bubble of this.layer.querySelectorAll<HTMLElement>(
      ".wish-bubble",
    )) {
      this.setText(bubble);
    }
  }

  private syncVisibleWishTexts(): void {
    const latestWishes = new Map(this.wishes.map((wish) => [wish.id, wish]));

    for (const [lane, currentWish] of [...this.laneWishes]) {
      if (!currentWish) continue;
      const latestWish = latestWishes.get(currentWish.id);

      if (!latestWish) {
        this.makeBubble(this.nextWish(), lane);
        continue;
      }

      this.laneWishes.set(lane, latestWish);
      const bubble = this.layer.querySelector<HTMLElement>(
        `.wish-bubble[data-lane="${lane}"]`,
      );
      if (!bubble) continue;

      this.bubbleWish.set(bubble, latestWish);
      this.setText(bubble);
    }
  }

  private displayWishNow(wish: BubbleWish): void {
    const laneCount = this.lanes().length;
    if (laneCount === 0) return;

    const emptyLane = Array.from({ length: laneCount }, (_, lane) => lane).find(
      (lane) => !this.laneWishes.get(lane),
    );
    const lane =
      emptyLane ?? this.immediateLaneCursor++ % Math.max(1, laneCount);

    const existingTimer = this.timers.get(lane);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      this.timers.delete(lane);
    }
    this.makeBubble(wish, lane);
  }

  private scheduleReplacement(lane: number, delay: number): void {
    const existing = this.timers.get(lane);
    if (existing !== undefined) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      this.timers.delete(lane);
      if (this.started && !this.destroyed) {
        this.makeBubble(this.nextWish(), lane);
      }
    }, delay);
    this.timers.set(lane, timer);
  }

  private retireWishFromLane(lane: number): void {
    this.laneWishes.set(lane, null);
  }

  private setTransientTimeout(callback: () => void, delay: number): void {
    const timer = window.setTimeout(() => {
      this.transientTimers.delete(timer);
      if (!this.destroyed) callback();
    }, delay);
    this.transientTimers.add(timer);
  }

  private createPopEffect(rect: DOMRect): void {
    const effect = document.createElement("div");
    effect.className = "wish-bubble-pop";
    effect.setAttribute("aria-hidden", "true");
    effect.style.setProperty("--pop-x", `${rect.left + rect.width / 2}px`);
    effect.style.setProperty("--pop-y", `${rect.top + rect.height / 2}px`);
    effect.style.setProperty("--pop-size", `${rect.width}px`);

    const ring = document.createElement("span");
    ring.className = "wish-bubble-pop-ring";
    effect.appendChild(ring);

    const dropletCount = innerWidth <= 760 ? 10 : 14;
    for (let index = 0; index < dropletCount; index += 1) {
      const droplet = document.createElement("i");
      const angle = (Math.PI * 2 * index) / dropletCount + Math.random() * 0.35;
      const distance = rect.width * (0.34 + Math.random() * 0.32);
      const size = Math.max(3, rect.width * (0.018 + Math.random() * 0.025));
      droplet.style.setProperty("--drop-x", `${Math.cos(angle) * distance}px`);
      droplet.style.setProperty("--drop-y", `${Math.sin(angle) * distance}px`);
      droplet.style.setProperty("--drop-size", `${size}px`);
      droplet.style.setProperty("--drop-delay", `${Math.random() * 70}ms`);
      effect.appendChild(droplet);
    }

    this.layer.appendChild(effect);
    this.setTransientTimeout(() => effect.remove(), 820);
  }

  private popBubble(bubble: HTMLButtonElement, lane: number): void {
    if (bubble.dataset.popping === "true") return;
    bubble.dataset.popping = "true";

    const rect = bubble.getBoundingClientRect();
    this.createPopEffect(rect);
    bubble.classList.add("is-popping");
    bubble.disabled = true;
    this.retireWishFromLane(lane);

    this.setTransientTimeout(() => bubble.remove(), 240);
    this.scheduleReplacement(lane, 760 + Math.random() * 420);
  }

  private makeBubble(
    wish: BubbleWish | null,
    laneIndex: number,
    initial = false,
    index = 0,
  ): void {
    if (!this.started || this.destroyed) return;
    const lanes = this.lanes();
    const safeLane = ((laneIndex % lanes.length) + lanes.length) % lanes.length;
    const lane = lanes[safeLane];
    if (!lane) return;
    this.layer.querySelector(`.wish-bubble[data-lane="${safeLane}"]`)?.remove();

    const viewportWidth = innerWidth;
    const { min, max } = this.sizeRange();
    const size = Math.round(min + Math.random() * (max - min));
    const laneStart = lane.start * viewportWidth;
    const laneEnd = lane.end * viewportWidth;
    const edgeInset = viewportWidth <= 760 ? 8 : 18;
    const safeMin = edgeInset + size / 2;
    const safeMax = viewportWidth - edgeInset - size / 2;
    const desiredSway =
      viewportWidth <= 430
        ? 14 + Math.random() * 16
        : viewportWidth <= 760
          ? 18 + Math.random() * 22
          : viewportWidth <= 1040
            ? 24 + Math.random() * 28
            : 30 + Math.random() * 38;
    const minimumSway = 6;
    const randomMin = Math.max(safeMin + desiredSway, laneStart);
    const randomMax = Math.min(safeMax - desiredSway, laneEnd);
    const fallbackMin = Math.max(safeMin + minimumSway, laneStart);
    const fallbackMax = Math.min(safeMax - minimumSway, laneEnd);
    const fallbackX =
      fallbackMax > fallbackMin
        ? fallbackMin + Math.random() * (fallbackMax - fallbackMin)
        : (safeMin + safeMax) / 2;
    const x =
      randomMax > randomMin
        ? randomMin + Math.random() * (randomMax - randomMin)
        : fallbackX;
    const swayAmplitude = Math.max(
      minimumSway,
      Math.min(desiredSway, x - safeMin, safeMax - x),
    );
    const wavePhase = Math.random() * Math.PI * 2;
    const waveTurns = 1.35 + Math.random() * 0.75;
    const swayAt = (progress: number): number => {
      const primary = Math.sin(wavePhase + progress * Math.PI * 2 * waveTurns);
      const secondary =
        Math.sin(wavePhase * 0.63 + progress * Math.PI * 2 * waveTurns * 1.7) *
        0.18;
      return Math.round((primary + secondary) * swayAmplitude * 0.84);
    };
    const swayPoints = [0, 0.16, 0.32, 0.48, 0.64, 0.8, 1].map(swayAt);
    const originalDuration =
      viewportWidth <= 760 ? 20 + Math.random() * 5 : 22 + Math.random() * 7;
    const duration = originalDuration - 1;
    const delay = initial
      ? -((index + 1) * (duration / (lanes.length + 1)))
      : 0;
    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.tabIndex = 0;
    bubble.className = "wish-bubble";
    bubble.dataset.lane = String(safeLane);
    bubble.innerHTML = "<span></span>";
    this.laneWishes.set(safeLane, wish);
    this.bubbleWish.set(bubble, wish);
    this.setText(bubble);
    bubble.style.setProperty("--size", `${size}px`);
    bubble.style.setProperty("--x-start", `${x.toFixed(1)}px`);
    swayPoints.forEach((sway, pointIndex) => {
      bubble.style.setProperty(`--sway-${pointIndex}`, `${sway}px`);
    });
    bubble.style.setProperty("--duration", `${duration.toFixed(1)}s`);
    bubble.style.setProperty("--delay", `${delay.toFixed(1)}s`);
    bubble.style.setProperty(
      "--wobble",
      `${(3.2 + Math.random() * 2.2).toFixed(2)}s`,
    );
    bubble.style.setProperty(
      "--hue-shift",
      `${Math.round(-16 + Math.random() * 32)}deg`,
    );
    if (this.paused) bubble.style.animationPlayState = "paused";
    bubble.addEventListener("focus", () => {
      bubble.style.animationPlayState = "paused";
    });
    bubble.addEventListener("blur", () => {
      if (!this.paused) bubble.style.animationPlayState = "running";
    });
    bubble.addEventListener("click", () => this.popBubble(bubble, safeLane));
    bubble.addEventListener(
      "animationend",
      (event) => {
        if (
          event.animationName !== "wishBubbleFloat" ||
          bubble.dataset.popping === "true"
        ) {
          return;
        }

        this.retireWishFromLane(safeLane);
        bubble.remove();
        this.scheduleReplacement(safeLane, 650 + Math.random() * 1_050);
      },
      { once: true },
    );
    this.layer.appendChild(bubble);
  }

  private seedSession(): void {
    if (
      !this.started ||
      !this.feedLoaded ||
      this.sessionSeeded ||
      this.destroyed
    ) {
      return;
    }

    this.clear();
    this.cursor = 0;
    this.laneWishes.clear();

    const laneCount = this.lanes().length;
    for (let lane = 0; lane < laneCount; lane += 1) {
      this.makeBubble(this.nextWish(), lane, true, lane);
    }

    this.sessionSeeded = true;
  }

  private reflow(): void {
    if (!this.started || !this.sessionSeeded || this.destroyed) return;

    const laneCount = this.lanes().length;
    for (const lane of this.laneWishes.keys()) {
      if (lane >= laneCount) this.laneWishes.delete(lane);
    }
    for (let lane = 0; lane < laneCount; lane += 1) {
      if (!this.laneWishes.has(lane)) this.laneWishes.set(lane, null);
    }

    const assignments = Array.from(
      { length: laneCount },
      (_, lane) => this.laneWishes.get(lane) ?? null,
    );

    this.clear();
    assignments.forEach((wish, lane) => {
      this.makeBubble(wish, lane, true, lane);
    });
  }

  private clear(): void {
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    for (const timer of this.transientTimers) window.clearTimeout(timer);
    this.transientTimers.clear();
    this.layer.replaceChildren();
  }

  private start(): void {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.seedSession();
  }

  private updateMode(): void {
    const home = !location.hash || location.hash === "#home";
    this.layer.classList.toggle("is-muted", !home);
  }
}
